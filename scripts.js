// Initialize Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Replace the placeholder values with your actual Firebase project configuration
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Get references to DOM elements
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSizeInput = document.getElementById('brushSize');
const saveButton = document.getElementById('saveButton');
const loadButton = document.getElementById('loadButton');
const downloadButton = document.getElementById('downloadButton');
const clearButton = document.getElementById('clearButton');

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
});

// Save, Load, and Download functions
saveButton.addEventListener('click', saveDrawing);
loadButton.addEventListener('click', loadDrawing);
downloadButton.addEventListener('click', downloadDrawing);

function saveDrawing() {
  const dataURL = canvas.toDataURL();
  const drawingRef = database.ref('drawings').push();
  drawingRef.set({
    imageData: dataURL,
    timestamp: Date.now()
  }, (error) => {
    if (error) {
      alert('Error saving drawing: ' + error);
    } else {
      alert('Drawing saved to Firebase.');
    }
  });
}

function loadDrawing() {
  database.ref('drawings').orderByChild('timestamp').limitToLast(1).once('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const drawingData = Object.values(data)[0].imageData;
      const img = new Image();
      img.src = drawingData;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
    } else {
      alert('No drawings found in Firebase.');
    }
  });
}

function downloadDrawing() {
  const dataURL = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'drawing.png';
  link.href = dataURL;
  link.click();
}

// Drawing function
function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.closePath();
}
