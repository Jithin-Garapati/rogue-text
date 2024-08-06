from pydub import AudioSegment
from pydub.silence import detect_silence

def improved_silence_detection(audio_file, min_silence_len=1000, silence_thresh=-40):
    # Load audio file
    audio = AudioSegment.from_wav(audio_file)
    
    # Detect silence
    silence_ranges = detect_silence(audio, min_silence_len=min_silence_len, silence_thresh=silence_thresh)
    
    # Convert milliseconds to seconds
    silence_ranges = [(start / 1000, end / 1000) for start, end in silence_ranges]
    
    return silence_ranges

# Remove the spectral-based silence detection and other unused functions