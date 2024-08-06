
from flask import Flask, jsonify, render_template, request, flash, redirect, url_for
from groq import Groq
client = Groq(api_key="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")
import os
from revised_silence_detection import improved_silence_detection
import subprocess
import requests
import csv
from flask import send_from_directory
from tempfile import NamedTemporaryFile
from moviepy.editor import VideoFileClip, concatenate_videoclips
import whisper_timestamped
import whisper
import ffmpeg
import gc


cwd = os.getcwd()

def insert_silences_into_transcript(transcript_content, silence_threshold=0.5):
    new_transcript_lines = []
    prev_end_time = 0.0  
    
    for line in transcript_content.strip().split('\n'):
   
        word, start_time, end_time = line.split(';')
        start_time = float(start_time)
        end_time = float(end_time)

        if start_time - prev_end_time >= silence_threshold:
            new_transcript_lines.append(f"{{:}};{prev_end_time};{start_time}")
        
        new_transcript_lines.append(line)

        prev_end_time = end_time
    
    return '\n'.join(new_transcript_lines)


app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.secret_key = "secret_key"


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part')
            return redirect(request.url)
        file = request.files['file']
        if file.filename == '':
            flash('No selected file')
            return redirect(request.url)
        if file and allowed_file(file.filename):
            filename = os.path.join(app.config['UPLOAD_FOLDER'], 'video.mp4')
            file.save(filename)

            # Convert video to WAV
            audio_path = filename.rsplit('.', 1)[0] + '.wav'
            subprocess.run(["ffmpeg", "-y", "-i", filename, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", audio_path])

            # Get the transcript
            transcription_type = request.form.get('transcriptionType', 'whisper_timestamped')
            model_type = request.form.get('modelType', 'base')  # Get the selected Whisper model type
            print("Transcription Type Selected:", transcription_type)
            print("Whisper Model Type Selected:", model_type)
            transcript_file = getTranscription(audio_path, transcription_type, model_type)

            return render_template('index.html', transcript_file=transcript_file, transcription_complete=True)

    return render_template('index.html', transcription_complete=False)


def getTranscription(file_path, transcription_type='whisper_timestamped', model_type='base'):
    def video_to_audio(video_path, audio_path):
        ffmpeg.input(video_path).output(audio_path, format="wav", ac=1, ar="16000").run(overwrite_output=True)
    
    # Temporary audio file path
    audio_path = "temp_audio.wav"

    # Convert video to audio
    video_to_audio(file_path, audio_path)

    # Detect silences
    silence_ranges = improved_silence_detection(audio_path)


    if transcription_type == 'Deepgram':
        output = transcribe_audio_with_Deepgram(audio_path)
        formatted_transcript = []

    # Navigate through the data structure to get to the words
        for channel in output.get("results", {}).get("channels", []):
            for alternative in channel.get("alternatives", []):
                words = alternative.get("words", [])
                for word_info in words:
                    # Extract the word, start, and end times
                    word = word_info.get("word")
                    start = word_info.get("start")
                    end = word_info.get("end")

                    # Format and append to the list
                    formatted_line = f"{word};{start:.2f};{end:.2f}"
                    formatted_transcript.append(formatted_line)

        transcript_filename = os.path.join(app.config['UPLOAD_FOLDER'], 'transcript.txt')
        with open(transcript_filename, 'w', newline='') as f:
            writer = csv.writer(f, delimiter=';')
            for line in formatted_transcript:
                word, start, end = line.split(';')
                writer.writerow([word, start, end])


        pass
    else:
        transcription_result = transcribe_audio_with_whisper_timestamped(audio_path, model_type)
        formatted_transcript = []
        for segment in transcription_result['segments']:
            for word in segment['words']:
                formatted_transcript.append(f"{word['text']};{word['start']};{word['end']}")

    # Insert silences into the transcript
    transcript_with_silences = insert_silences_into_transcript(formatted_transcript, silence_ranges)

    transcript_filename = os.path.join(app.config['UPLOAD_FOLDER'], 'transcript.txt')
    with open(transcript_filename, 'w', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        for line in transcript_with_silences:
            word, start, end = line.split(';')
            writer.writerow([word, start, end])

    # Optionally, remove the temporary audio file
    os.remove(audio_path)

    return transcript_filename


def insert_silences_into_transcript(transcript, silence_ranges):
    new_transcript = []
    silence_index = 0
    
    for line in transcript:
        word, start, end = line.split(';')
        start, end = float(start), float(end)
        
        while silence_index < len(silence_ranges) and silence_ranges[silence_index][1] <= start:
            silence_index += 1
        
        if silence_index < len(silence_ranges) and silence_ranges[silence_index][0] < start:
            new_transcript.append(f"{{:}};{silence_ranges[silence_index][0]};{start}")
        
        new_transcript.append(line)
    
    return new_transcript

def transcribe_audio_with_Deepgram(audio_path):
            url = "https://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=true&diarize=true&smart_format=true"
            #url = "https://api.deepgram.com/v1/listen?model=whisper-large&detect_language=true"
            headers = {
                "Authorization": 'Token ' + '476cfafd77017a56bca84579c2951fb3d0877e4c',
                "Content-Type": "audio/mpeg"
            }

            with open(audio_path, 'rb') as file:
                response = requests.post(url, headers=headers, data=file)

            output = response.json()
            return output

def transcribe_audio_with_whisper_timestamped(audio_path, model_name):
    """
    Transcribes an audio file using Whisper-Timestamped.
    """
    model_dir = os.path.join(os.getcwd(), "whisper_models")  # Directory to store the models

    # Create the model directory if it doesn't exist
    os.makedirs(model_dir, exist_ok=True)

    # Download the model using the whisper library
    model = whisper.load_model(model_name, download_root=model_dir)

    # Transcribe the audio using whisper_timestamped
    result = whisper_timestamped.transcribe(model, audio_path)

    return result

def process_transcript_for_segments(edited_transcript, timestamps):
    edited_lines = edited_transcript.strip().split('\n')
    edited_words = [line.split(';')[0] for line in edited_lines]

    segments_to_keep = []
    current_segment = None

    for word, start, end in timestamps:
        start_time = float(start)
        end_time = float(end)

        if word in edited_words:
            if current_segment is None:
                current_segment = [start_time, end_time]
            else:
                current_segment[1] = end_time
        else:
            if current_segment is not None:
                segments_to_keep.append(tuple(current_segment))
                current_segment = None

            segments_to_keep.append((start_time, end_time))

    if current_segment is not None:
        segments_to_keep.append(tuple(current_segment))

    return segments_to_keep

def cut_and_concatenate_video(segments, video_path, resolution, bitrate, file_format):
    try:
        if not segments:
            raise ValueError("No segments provided for video processing")

        temp_output_path = os.path.join(app.config['UPLOAD_FOLDER'], f'output.{file_format}')

        with VideoFileClip(video_path) as video:
            clips = []
            for start, end in segments:
                if start is None or end is None:
                    app.logger.warning(f"Invalid segment: {start} - {end}")
                    continue
                if start >= end:
                    app.logger.warning(f"Invalid segment (start >= end): {start} - {end}")
                    continue
                if start < 0:
                    app.logger.warning(f"Invalid start time: {start}")
                    start = 0
                if end > video.duration:
                    app.logger.warning(f"End time {end} exceeds video duration {video.duration}")
                    end = video.duration
                clips.append(video.subclip(start, end))

            if not clips:
                raise ValueError("No valid clips to concatenate")

            final_clip = concatenate_videoclips(clips, method="compose")
            final_clip.write_videofile(temp_output_path, codec='libx264', audio_codec='aac',
                                       preset='medium', bitrate=bitrate,
                                       threads=4, fps=24, ffmpeg_params=[f'-vf', f'scale=-1:{resolution}'])
            for clip in clips:
                clip.close()
        return temp_output_path
    except Exception as e:
        app.logger.error(f"Error in cut_and_concatenate_video: {str(e)}")
        raise
    

@app.route('/process-edit', methods=['POST'])
def process_edit():
    transcript_path = os.path.join(cwd, 'uploads', 'transcript.txt')
    data = request.json
    edited_transcript = data['transcript']
    timestamps = [(line.split(';')[0], line.split(';')[1], line.split(';')[2]) for line in open(transcript_path, 'r')]

    # Determine the segments of the video to keep
    segments_to_keep = process_transcript_for_segments(edited_transcript, timestamps)

    # Path to the original video
    video_path = os.path.join(app.config['UPLOAD_FOLDER'], 'video.mp4')

    # Cut and concatenate the video
    updated_video_filename = cut_and_concatenate_video(segments_to_keep, video_path)

    return send_from_directory(app.config['UPLOAD_FOLDER'], updated_video_filename)


@app.route('/export_video', methods=['POST'])
def export_video():
    data = request.get_json()
    if 'segments' not in data:
        return jsonify({"error": "No segments provided"}), 400

    segments_to_keep = data['segments']
    resolution = data.get('resolution', '720p')
    file_format = data.get('format', 'mp4')

    video_path = os.path.join(app.config['UPLOAD_FOLDER'], 'video.mp4')

    # Define a mapping of resolution to recommended bitrate
    bitrate_mapping = {
        '720p': '2M',
        '1080p': '4M',
        '1440p': '6M'
    }
    bitrate = bitrate_mapping.get(resolution, '2M')

    try:
        with VideoFileClip(video_path) as video:
            edited_clips = [video.subclip(segment['start'], segment['end']) for segment in segments_to_keep]
            final_clip = concatenate_videoclips(edited_clips)
            
            output_resolution = int(resolution[:-1])  # Extract numeric value from resolution string
            final_clip = final_clip.resize(height=output_resolution)
            
            output_filename = f'exported_video.{file_format}'
            output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
            
            final_clip.write_videofile(output_path, codec='libx264', audio_codec='aac',
                                       preset='medium', bitrate=bitrate,
                                       threads=4, fps=24)

        return send_from_directory(app.config['UPLOAD_FOLDER'], output_filename, as_attachment=True)
    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "Failed to process video"}), 500

    

@app.route('/update_transcript', methods=['POST'])
def update_transcript():
    updated_transcript = request.json
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], 'transcript.txt')
    
    try:
        with open(transcript_path, 'w') as f:
            for word_data in updated_transcript:
                if not word_data.get('isSilence'):
                    f.write(f"{word_data['word']};{word_data['start']};{word_data['end']}\n")
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error updating transcript: {str(e)}")
        return jsonify({"success": False})

@app.route('/get_transcript')
def get_transcript():
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], 'transcript.txt')
    with open(transcript_path, 'r') as f:
        transcript_content = f.read()
    return transcript_content

@app.route('/workspace')
def workspace():
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], 'transcript.txt')
    with open(transcript_path, 'r') as f:
        transcript_content = f.read()
    return render_template('prototype-1.html', transcript_data=transcript_content)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/download/<filename>', methods=['GET'])
def download(filename):
    uploads = os.path.join(cwd, app.config['UPLOAD_FOLDER'])
    filename = "transcript.txt"
    return send_from_directory(uploads, filename)



def generate_title(transcript):
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": "Generate a short and catchy title for the following video transcript, only generate one and only output the title and nothing else."},
            {"role": "user", "content": transcript}
        ],
        model="llama3-70b-8192"
    )
    title = chat_completion.choices[0].message.content.strip()
    return title

@app.route('/generate_title', methods=['POST'])
def generate_title_route():
    transcript = request.json['transcript']
    title = generate_title(transcript)
    return jsonify(title)



if __name__ == '__main__':
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    
    app.run(debug=True)

