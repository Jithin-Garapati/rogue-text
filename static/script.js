
let transcriptHistory = [];
let currentHistoryIndex = -1;
const SILENCE_THRESHOLD = 0.5;

// Define the video source
const videoSrc = "uploads/video.mp4";

// Initialize video.js player
const video = videojs('video');

// Get required DOM elements
const transcript = document.getElementById('transcript');

// Initialize variables for transcript highlighting
let currentWordIndex = 0;

// Fetch transcript data from a file
async function fetchTranscriptData() {
  const response = await fetch('/uploads/transcript.txt');
  const text = await response.text();
  const lines = text.split('\n');

  // Parse the transcript data
  return lines.map(line => {
    const [word, start, end] = line.split(';');
    return { word, start: parseFloat(start), end: parseFloat(end) };
  });
}

// Play the video at a specific start time
function playVideo(startTime) {
  if (video.readyState() >= 2) {
    video.currentTime(startTime);
    video.play();
  } else {
    video.on('canplay', () => {
      playVideo(startTime);
    });
  }
}
function highlightWord(index) {
  const wordSpans = transcript.getElementsByTagName('span');
  if (currentWordIndex >= 0 && currentWordIndex < wordSpans.length) {
    wordSpans[currentWordIndex].classList.remove('highlight');
  }
  if (index >= 0 && index < wordSpans.length) {
    wordSpans[index].classList.add('highlight');
    wordSpans[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  currentWordIndex = index;
}

// Highlight the current word in the transcript
function updateTranscriptHighlight() {
  const currentTime = video.currentTime();
  let newIndex = -1;
  let skipToTime = null;

  // Find the index of the word currently being played or the next word to play if the current is deleted
  for (let i = 0; i < transcriptData.length; i++) {
    const start = parseFloat(transcriptData[i].start);
    const end = parseFloat(transcriptData[i].end);
    if (start <= currentTime && end >= currentTime) {
      const wordSpan = document.querySelector(`span[data-index="${i}"]`);
      if (wordSpan && wordSpan.classList.contains('deleted')) {
        // If current word is deleted, find the next non-deleted word and get its start time
        for (let j = i + 1; j < transcriptData.length; j++) {
          const nextWordSpan = document.querySelector(`span[data-index="${j}"]`);
          if (nextWordSpan && !nextWordSpan.classList.contains('deleted')) {
            skipToTime = parseFloat(transcriptData[j].start);
            break;
          }
        }
        break;
      } else {
        // If current word is not deleted, highlight it
        newIndex = i;
        break;
      }
    }
  }

  // If we have a time to skip to, set the video to that time
  if (skipToTime !== null && skipToTime !== currentTime) {
    video.currentTime(skipToTime);
  } else if (newIndex !== currentWordIndex) {
    // Highlight the new word if it's different from the current word
    highlightWord(newIndex);
  }
}

// Event listener for the 'Remove Silences' button
document.getElementById('removeSilence').addEventListener('click', () => {
  saveState(); // Save the current state before removing silences

  const currentState = transcriptData.map((wordData, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    return wordSpan.classList.contains('deleted');
  });

  currentState.forEach((isDeleted, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    if (wordSpan.classList.contains('silence-marker') && !isDeleted) {
      wordSpan.classList.add('deleted');
    }
  });

  // Update the video playback to immediately skip silences if currently on one
  updateTranscriptHighlight();
});


// Build the transcript HTML
function buildTranscript() {
  transcript.innerHTML = '';
  transcriptData.forEach((wordData, index) => {
    const wordSpan = document.createElement('span');
    wordSpan.textContent = wordData.word + ' ';
    wordSpan.dataset.index = index;
    wordSpan.dataset.start = wordData.start;
    wordSpan.dataset.end = wordData.end;
    wordSpan.classList.add('word');
    if (wordData.word === "{:}") {
      wordSpan.classList.add('silence-marker');
    }
    if (wordData.adjusted) {
      wordSpan.classList.add('adjusted');
    }
    transcript.appendChild(wordSpan);
  });
}

// Initialize history on page load
window.addEventListener('load', () => {
  updateTranscriptHistory(transcriptData);
});

// Add keyboard shortcuts for undo and redo
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'z') {
    event.preventDefault();
    undo();
  } else if (event.ctrlKey && event.key === 'y') {
    event.preventDefault();
    redo();
  }
});
// Add event listeners
transcript.addEventListener('mouseup', handleTextSelection);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideEditingToolbar();
    const timingAdjustmentBar = document.getElementById('timingAdjustmentBar');
    if (timingAdjustmentBar) {
      timingAdjustmentBar.style.display = 'none';
    }
    video.pause();
  }
});


// Initialize undo and redo stacks
const undoStack = [];
const redoStack = [];

// Function to save the current state of the transcript
function saveState() {
  const state = transcriptData.map((wordData, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    return wordSpan.classList.contains('deleted');
  });
  undoStack.push(state);
  redoStack.length = 0; // Clear the redo stack when a new state is saved
}

// Function to restore a state from the undo or redo stack
function restoreState(state) {
  state.forEach((isDeleted, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    if (isDeleted) {
      wordSpan.classList.add('deleted');
      wordSpan.style.textDecoration = 'line-through';
      wordSpan.style.color = 'grey';
    } else {
      wordSpan.classList.remove('deleted');
      wordSpan.style.textDecoration = '';
      wordSpan.style.color = '';
    }
  });
}

function removeSilences(state) {
  state.forEach((isDeleted, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    if (wordSpan.classList.contains('silence-marker') && isDeleted) {
      wordSpan.classList.add('deleted');
    }
  });
}

// Function to restore silences
function restoreSilences(state) {
  state.forEach((isDeleted, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    if (wordSpan.classList.contains('silence-marker') && !isDeleted) {
      wordSpan.classList.remove('deleted');
    }
  });
}

// Handle selection and deletion of text
document.addEventListener('keydown', (event) => {
  if (event.key === 'Backspace' || event.key === 'Delete') {
    const selection = window.getSelection();
    if (!selection.isCollapsed) {
      saveState(); // Save the current state before applying deletion
      // If there is a range selected, apply deletion styling to all words in the range
      for (let i = 0; i < transcriptData.length; i++) {
        const wordSpan = document.querySelector(`span[data-index="${i}"]`);
        const wordRange = document.createRange();
        wordRange.selectNodeContents(wordSpan);

        if (selection.containsNode(wordSpan, true)) {
          wordSpan.classList.add('deleted');
          wordSpan.style.textDecoration = 'line-through';
          wordSpan.style.color = 'grey';
        }
      }
      event.preventDefault();
    }
  } else if (event.ctrlKey && event.key === 'z') {
    // Handle undo with Ctrl+Z
    if (undoStack.length > 0) {
      const previousState = undoStack.pop();
      redoStack.push(transcriptData.map((wordData, index) => {
        const wordSpan = document.querySelector(`span[data-index="${index}"]`);
        return wordSpan.classList.contains('deleted');
      }));
      restoreState(previousState);
      restoreSilences(previousState); // Restore silences based on the previous state
    }
    event.preventDefault();
  } else if (event.ctrlKey && event.key === 'y') {
    // Handle redo with Ctrl+Y
    if (redoStack.length > 0) {
      const nextState = redoStack.pop();
      undoStack.push(transcriptData.map((wordData, index) => {
        const wordSpan = document.querySelector(`span[data-index="${index}"]`);
        return wordSpan.classList.contains('deleted');
      }));
      restoreState(nextState);
      removeSilences(nextState); // Remove silences based on the next state
    }
    event.preventDefault();
  }
});


// Click to play from word
transcript.addEventListener('click', (event) => {
  if (event.target.classList.contains('word')) {
    const selection = window.getSelection();
    if (selection.isCollapsed) {
      // Only play from word if there's no selection range
      const wordIndex = event.target.dataset.index;
      playVideo(transcriptData[wordIndex].start);
    }
  }
});

// Function to check if a word should be marked as deleted
function checkDeletion() {
  const selection = window.getSelection();
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  if (range && range.collapsed) {
    const startContainer = range.startContainer;

    // If the start container of the selection is a text node inside a word span
    if (startContainer.nodeType === Node.TEXT_NODE && startContainer.parentElement.classList.contains('word')) {
      const wordSpan = startContainer.parentElement;
      if (wordSpan.textContent.trim() === '') {
        wordSpan.classList.add('deleted');
      }
    }
  }
}
document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('form');
  form.addEventListener('submit', function() {
      // Show the loading indicator
      document.getElementById('loadingIndicator').style.display = 'block';
  });
});

// Event listener for keydown to handle backspace
document.addEventListener('keydown', event => {
  if (event.key === 'Backspace') {
    // Delay the check to after the backspace effect
    setTimeout(checkDeletion, 10);
  }
});

// Fetch transcript data and set up event listeners
fetchTranscriptData().then((data) => {
  transcriptData = data;
  buildTranscript();
  video.on('timeupdate', updateTranscriptHighlight);

  const transcript = transcriptData.map((wordData) => wordData.word).join(' ');
  generateTitle(transcript).then((title) => {
    displayTitle(title);
  });
});

// Event listener for the 'Export Video' button
document.getElementById('exportButton').addEventListener('click', () => {
  const activeTranscriptData = transcriptData.filter((wordData, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    return !wordSpan.classList.contains('deleted');
  });

  const resolution = document.getElementById('resolutionSelect').value;
  const format = document.getElementById('formatSelect').value;

  const loadingIndicator = document.getElementById('loadingIndicator');
  loadingIndicator.style.display = 'block';

  fetch('/export_video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transcript: activeTranscriptData,
      resolution: resolution,
      format: format
    })
  })
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `exported_video.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    loadingIndicator.style.display = 'none';
  })
  .catch(error => {
    console.error('Error exporting video:', error);
    loadingIndicator.style.display = 'none';
  });
});

// Event listener for the 'Export Video' button
// Event listener for the 'Export Video' button
document.getElementById('exportButton').addEventListener('click', () => {
  const segmentsToKeep = getSegmentsToKeep();
  const resolution = document.getElementById('resolutionSelect').value;
  const format = document.getElementById('formatSelect').value;

  const exportOverlay = document.getElementById('exportOverlay');
  exportOverlay.style.display = 'flex';

  fetch('/export_video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      segments: segmentsToKeep,
      resolution: resolution,
      format: format
    })
  })
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `exported_video.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    exportOverlay.style.display = 'none';
  })
  .catch(error => {
    console.error('Error exporting video:', error);
    exportOverlay.style.display = 'none';
  });
});

function getSegmentsToKeep() {
  const segmentsToKeep = [];
  let currentSegment = null;

  transcriptData.forEach((wordData, index) => {
    const wordSpan = document.querySelector(`span[data-index="${index}"]`);
    const isDeleted = wordSpan.classList.contains('deleted');
    const isSilence = wordData.word === "{:}";

    if (!isDeleted && !isSilence) {
      if (!currentSegment) {
        currentSegment = {
          start: parseFloat(wordData.start),
          end: parseFloat(wordData.end)
        };
      } else {
        currentSegment.end = parseFloat(wordData.end);
      }
    } else if (currentSegment) {
      segmentsToKeep.push(currentSegment);
      currentSegment = null;
    }
  });

  if (currentSegment) {
    segmentsToKeep.push(currentSegment);
  }

  return segmentsToKeep;
}

// Get the necessary elements
const openSearchButton = document.getElementById('openSearchButton');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const closeSearchButton = document.getElementById('closeSearchButton');
const searchResults = document.getElementById('searchResults');

// Add event listeners
openSearchButton.addEventListener('click', openSearchOverlay);
searchButton.addEventListener('click', performSearch);
closeSearchButton.addEventListener('click', closeSearchOverlay);

// Function to open the search overlay
function openSearchOverlay() {
  searchOverlay.style.display = 'block';
  searchInput.focus();
}

// Function to close the search overlay
function closeSearchOverlay() {
  searchOverlay.style.display = 'none';
  searchInput.value = '';
  searchResults.innerHTML = '';
}

// Function to perform the search
function performSearch() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  if (searchTerm !== '') {
    const searchResultsData = [];

    // Loop through the transcript data to find matching words
    transcriptData.forEach((wordData, index) => {
      if (wordData.word.toLowerCase() === searchTerm) {
        searchResultsData.push({
          word: wordData.word,
          start: wordData.start,
          end: wordData.end,
          index: index
        });
      }
    });

    // Display the search results
    displaySearchResults(searchResultsData);
  }
}

// Function to display the search results
function displaySearchResults(searchResultsData) {
  searchResults.innerHTML = '';

  if (searchResultsData.length === 0) {
    searchResults.textContent = 'No results found.';
  } else {
    searchResultsData.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.classList.add('search-result');
      resultItem.textContent = `${result.word} - Start: ${result.start}s, End: ${result.end}s`;
      resultItem.addEventListener('click', () => {
        playVideo(result.start);
        closeSearchOverlay();
      });
      searchResults.appendChild(resultItem);
    });
  }
}

// Function to generate a title for the video
async function generateTitle(transcript) {
  const response = await fetch('/generate_title', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript }),
  });
  const title = await response.json();
  return title;
}


// Function to update the title in the frontend
function updateTitle(title) {
  const titleElement = document.getElementById('videoTitle');
  titleElement.textContent = title;
}

// Fetch transcript data and generate a title
fetchTranscriptData().then((data) => {
  transcriptData = data;
  buildTranscript();
  video.on('timeupdate', updateTranscriptHighlight);

  const transcript = transcriptData.map((wordData) => wordData.word).join(' ');
  generateTitle(transcript).then((title) => {
    updateTitle(title);
  });
});
function updateTitle(title) {
  const titleElement = document.getElementById('videoTitle');
  titleElement.textContent = ''; // Clear previous title
  let i = 0;
  function typeChar() {
      if (i < title.length) {
          titleElement.textContent += title.charAt(i);
          i++;
          setTimeout(typeChar, 20); // Adjust typing speed here
      }
  }
  typeChar();
}

//newly added

function handleTextSelection() {
  const selection = window.getSelection();
  selectedText = selection.toString().trim();
  
  if (selectedText) {
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.parentNode;
    const endNode = range.endContainer.parentNode;
    
    selectionStartTime = parseFloat(startNode.dataset.start);
    selectionEndTime = parseFloat(endNode.dataset.end);
    
    showEditingToolbar(selection);
  } else {
    hideEditingToolbar();
  }
}


function showEditingToolbar(selection) {
  const toolbar = document.getElementById('editingToolbar') || createEditingToolbar();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  toolbar.style.display = 'flex';
  toolbar.style.left = `${rect.left + window.scrollX}px`;
  toolbar.style.top = `${rect.top + window.scrollY - 40}px`;
}

function hideEditingToolbar() {
  const toolbar = document.getElementById('editingToolbar');
  if (toolbar) {
    toolbar.style.display = 'none';
  }
}

function createEditingToolbar() {
  const toolbar = document.createElement('div');
  toolbar.id = 'editingToolbar';
  toolbar.innerHTML = `
    <button id="adjustTimingBtn">Adjust Timing</button>
    <button id="playSelectionBtn">Play Selection</button>
    <button id="editTextBtn">Edit Text</button>
  `;
  document.body.appendChild(toolbar);
  
  toolbar.querySelector('#adjustTimingBtn').addEventListener('click', showTimingAdjustment);
  toolbar.querySelector('#playSelectionBtn').addEventListener('click', playSelection);
  toolbar.querySelector('#editTextBtn').addEventListener('click', startTextEditing);
  
  return toolbar;
}

function showTimingAdjustment() {
  const timingBar = document.getElementById('timingAdjustmentBar') || createTimingAdjustmentBar();
  timingBar.style.display = 'flex';
  
  document.getElementById('startTime').value = selectionStartTime.toFixed(2);
  document.getElementById('endTime').value = selectionEndTime.toFixed(2);
}

function createTimingAdjustmentBar() {
  const bar = document.createElement('div');
  bar.id = 'timingAdjustmentBar';
  bar.innerHTML = `
    <span>Start: <input type="number" id="startTime" step="0.01"></span>
    <button id="decreaseStartBtn">-</button>
    <button id="increaseStartBtn">+</button>
    <span>End: <input type="number" id="endTime" step="0.01"></span>
    <button id="decreaseEndBtn">-</button>
    <button id="increaseEndBtn">+</button>
    <button id="playAdjustedBtn">Play</button>
    <button id="saveAdjustmentBtn">Save</button>
  `;
  document.body.appendChild(bar);
  
  bar.querySelector('#decreaseStartBtn').addEventListener('click', () => adjustTiming('start', -0.1));
  bar.querySelector('#increaseStartBtn').addEventListener('click', () => adjustTiming('start', 0.1));
  bar.querySelector('#decreaseEndBtn').addEventListener('click', () => adjustTiming('end', -0.1));
  bar.querySelector('#increaseEndBtn').addEventListener('click', () => adjustTiming('end', 0.1));
  bar.querySelector('#playAdjustedBtn').addEventListener('click', playAdjustedSelection);
  bar.querySelector('#saveAdjustmentBtn').addEventListener('click', saveTimingAdjustment);
  
  return bar;
}

function adjustTiming(type, amount) {
  const input = document.getElementById(type === 'start' ? 'startTime' : 'endTime');
  input.value = (parseFloat(input.value) + amount).toFixed(2);
}

function playAdjustedSelection() {
  const start = parseFloat(document.getElementById('startTime').value);
  const end = parseFloat(document.getElementById('endTime').value);
  playVideoSegment(start, end);
}

function playSelection() {
  if (selectedText) {
    const startIndex = transcriptData.findIndex(word => parseFloat(word.start) >= selectionStartTime);
    const endIndex = transcriptData.findIndex(word => parseFloat(word.end) > selectionEndTime);
    
    const actualStart = parseFloat(transcriptData[startIndex].start);
    const actualEnd = parseFloat(transcriptData[endIndex].end);
    
    playVideoSegment(actualStart, actualEnd);
  }
}
function playVideoSegment(start, end) {
  video.currentTime(start);
  video.play();
  const stopPlayback = () => {
    if (video.currentTime() >= end) {
      video.pause();
      video.off('timeupdate', stopPlayback);
    }
  };
  video.on('timeupdate', stopPlayback);
}

function saveTimingAdjustment() {
  const newStart = parseFloat(document.getElementById('startTime').value);
  const newEnd = parseFloat(document.getElementById('endTime').value);
  
  const startIndex = transcriptData.findIndex(word => parseFloat(word.start) >= selectionStartTime);
  const endIndex = transcriptData.findIndex(word => parseFloat(word.end) > selectionEndTime);
  
  // Update the actual transcript data
  transcriptData[startIndex].start = newStart.toString();
  transcriptData[endIndex].end = newEnd.toString();
  
  for (let i = startIndex; i <= endIndex; i++) {
    transcriptData[i].adjusted = true;
    // Update the span data attributes
    const wordSpan = document.querySelector(`span[data-index="${i}"]`);
    if (wordSpan) {
      wordSpan.dataset.start = transcriptData[i].start;
      wordSpan.dataset.end = transcriptData[i].end;
    }
  }
  
  // Update history
  updateTranscriptHistory(transcriptData);
  
  // Rebuild the transcript display
  buildTranscript();
  
  hideTimingAdjustmentBar();
}

function hideTimingAdjustmentBar() {
  const timingAdjustmentBar = document.getElementById('timingAdjustmentBar');
  if (timingAdjustmentBar) {
    timingAdjustmentBar.style.display = 'none';
  }
}

function highlightAdjustedWords(startIndex, endIndex) {
  const words = document.querySelectorAll('.word');
  for (let i = startIndex; i <= endIndex; i++) {
    words[i].classList.add('adjusted');
  }
}

function updateTranscriptHistory(newTranscriptData) {
  if (currentHistoryIndex < transcriptHistory.length - 1) {
    transcriptHistory = transcriptHistory.slice(0, currentHistoryIndex + 1);
  }
  transcriptHistory.push(JSON.parse(JSON.stringify(newTranscriptData)));
  currentHistoryIndex++;
  transcriptData = JSON.parse(JSON.stringify(newTranscriptData));
  buildTranscript();
}

function undo() {
  if (currentHistoryIndex > 0) {
    currentHistoryIndex--;
    transcriptData = JSON.parse(JSON.stringify(transcriptHistory[currentHistoryIndex]));
    buildTranscript();
  }
}

function redo() {
  if (currentHistoryIndex < transcriptHistory.length - 1) {
    currentHistoryIndex++;
    transcriptData = JSON.parse(JSON.stringify(transcriptHistory[currentHistoryIndex]));
    buildTranscript();
  }
}

function showActionMessage(message) {
  const actionMessage = document.getElementById('actionMessage');
  actionMessage.textContent = message;
  actionMessage.style.opacity = '1';
  setTimeout(() => {
    actionMessage.style.opacity = '0';
  }, 3000);
}

function updateUndoRedoButtons() {
  document.getElementById('undoBtn').disabled = currentHistoryIndex <= 0;
  document.getElementById('redoBtn').disabled = currentHistoryIndex >= transcriptHistory.length - 1;
}

function revertToOriginal() {
  if (originalTranscriptData) {
    transcriptData = JSON.parse(JSON.stringify(originalTranscriptData));
    updateTranscriptHistory(transcriptData);
    buildTranscript();
  }
}

function startTextEditing() {
  const editableDiv = document.createElement('div');
  editableDiv.contentEditable = true;
  editableDiv.textContent = selectedText;
  editableDiv.classList.add('editable-text');
  
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents();
  range.insertNode(editableDiv);
  
  editableDiv.focus();
  
  editableDiv.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTextEdit(editableDiv);
    }
  });

  editableDiv.addEventListener('blur', () => {
    saveTextEdit(editableDiv);
  });
}

function saveTextEdit(editableDiv) {
  const correctedText = editableDiv.textContent;
  const textNode = document.createTextNode(correctedText);
  editableDiv.parentNode.replaceChild(textNode, editableDiv);
  
  const startIndex = transcriptData.findIndex(word => parseFloat(word.start) >= selectionStartTime);
  const endIndex = transcriptData.findIndex(word => parseFloat(word.end) > selectionEndTime);
  
  const correctedWords = correctedText.split(/\s+/);
  const newTranscriptData = JSON.parse(JSON.stringify(transcriptData));
  
  newTranscriptData.splice(startIndex, endIndex - startIndex + 1, ...correctedWords.map((word, index) => ({
    word,
    start: index === 0 ? newTranscriptData[startIndex].start : '',
    end: index === correctedWords.length - 1 ? newTranscriptData[endIndex].end : '',
    adjusted: true
  })));
  
  updateTranscriptHistory(newTranscriptData);
  
  hideEditingToolbar();
}



function updateTranscriptData(correctedText) {
  const startIndex = transcriptData.findIndex(word => parseFloat(word.start) >= selectionStartTime);
  const endIndex = transcriptData.findIndex(word => parseFloat(word.end) > selectionEndTime);
  
  console.log('Updating transcript data from index', startIndex, 'to', endIndex);

  const correctedWords = correctedText.split(/\s+/);
  const newTranscriptData = JSON.parse(JSON.stringify(transcriptData)); // Deep copy
  
  // Replace the words in the selected range with the corrected words
  newTranscriptData.splice(startIndex, endIndex - startIndex + 1, ...correctedWords.map((word, index) => ({
    word,
    start: index === 0 ? newTranscriptData[startIndex].start : '',
    end: index === correctedWords.length - 1 ? newTranscriptData[endIndex].end : '',
    adjusted: true
  })));
  
  updateTranscriptHistory(newTranscriptData);
  buildTranscript();
}
document.getElementById('playSelectionBtn').addEventListener('click', playSelection);



function updateSubtitles(currentTime) {
  let newSubtitle = '';
  const wordsInSubtitle = [];
  
  for (let i = 0; i < transcriptData.length; i++) {
    const word = transcriptData[i];
    if (parseFloat(word.start) <= currentTime && parseFloat(word.end) >= currentTime) {
      wordsInSubtitle.push(word.word);
    }
    
    // Include a few words ahead for context
    if (wordsInSubtitle.length < 5 && parseFloat(word.start) > currentTime) {
      wordsInSubtitle.push(word.word);
    }
    
    if (wordsInSubtitle.length >= 5 || (wordsInSubtitle.length > 0 && i === transcriptData.length - 1)) {
      break;
    }
  }
  
  newSubtitle = wordsInSubtitle.join(' ');
  
  if (newSubtitle !== currentSubtitle) {
    currentSubtitle = newSubtitle;
    subtitlesContainer.textContent = currentSubtitle;
  }
}

video.on('timeupdate', () => {
  const currentTime = video.currentTime();
  updateSubtitles(currentTime);
  updateTranscriptHighlight();
});