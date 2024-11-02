// JavaScript for Drawing App with Firebase

const firebaseConfig = {
    databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Get references to DOM elements
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSizeInput = document.getElementById('brushSize');
const clearButton = document.getElementById('clearButton');
const infoMessage = document.createElement('div');

document.body.appendChild(infoMessage);
infoMessage.id = 'infoMessage';

let drawing = false;
let currentX = 0;
let currentY = 0;

// Set up drawing context
ctx.lineWidth = brushSizeInput.value;
ctx.strokeStyle = colorPicker.value;
ctx.lineCap = 'round';

// Event listeners for drawing
canvas.addEventListener('mousedown', (e) => {
  drawing = true;
  [currentX, currentY] = [e.offsetX, e.offsetY];
});

canvas.addEventListener('mousemove', (e) => {
  if (!drawing) return;
  drawLine(currentX, currentY, e.offsetX, e.offsetY);
  [currentX, currentY] = [e.offsetX, e.offsetY];
});

canvas.addEventListener('mouseup', () => {
  drawing = false;
  autoSaveDrawing();
});

canvas.addEventListener('mouseout', () => {
  drawing = false;
});

// Update brush size and color
brushSizeInput.addEventListener('input', () => {
  ctx.lineWidth = brushSizeInput.value;
});

colorPicker.addEventListener('change', () => {
  ctx.strokeStyle = colorPicker.value;
});

// Clear canvas
clearButton.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showInfoMessage('Canvas cleared');
  autoSaveDrawing();
});

// Automatic load on page load
window.addEventListener('load', () => {
  loadDrawing();
});

function autoSaveDrawing() {
  const dataURL = canvas.toDataURL();
  const drawingRef = database.ref('drawings/autoSave');
  drawingRef.set({
    imageData: dataURL,
    timestamp: Date.now()
  }, (error) => {
    if (error) {
      showInfoMessage('Error saving drawing automatically: ' + error);
    } else {
      showInfoMessage('Drawing saved automatically');
    }
  });
}

function loadDrawing() {
  database.ref('drawings/autoSave').once('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const drawingData = data.imageData;
      const img = new Image();
      img.src = drawingData;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        showInfoMessage('Drawing loaded from Firebase.');
      };
    } else {
      showInfoMessage('No saved drawing found in Firebase.');
    }
  });
}

// Drawing function
function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.closePath();
}

// Info message function
function showInfoMessage(message) {
  infoMessage.textContent = message;
  infoMessage.classList.add('visible');
  setTimeout(() => {
    infoMessage.classList.remove('visible');
  }, 3000);
}
