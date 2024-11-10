const firebaseConfig = {
  databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();// Get references to DOM elements
const canvas = document.getElementById('drawingCanvas');
canvas.width = 1600;
canvas.height = 800;
const ctx = canvas.getContext('2d');


ctx.lineCap = 'round'; // Gives round edges to the line segments
ctx.lineJoin = 'round'; // Ensures corners are rounded and connected smoothly
const clearButton = document.getElementById('clearButton');
const downloadButton = document.getElementById('downloadButton');
const infoMessage = document.createElement('div');
const toggleSnapButton = document.getElementById('toggleSnapButton');
let realtimeListenerActive
document.body.appendChild(infoMessage);
infoMessage.id = 'infoMessage';

// Create cursor indicators
const cursorXTick = document.createElement('div');
cursorXTick.id = 'cursorX';
cursorXTick.className = 'crosshair';
document.body.appendChild(cursorXTick);
let mouseX = 0;
let mouseY = 0;
const cursorYTick = document.createElement('div');
cursorYTick.id = 'cursorY';
cursorYTick.className = 'crosshair';
document.body.appendChild(cursorYTick);
// Create brush preview element
const brushPreview = document.createElement('div');
document.body.appendChild(brushPreview);
brushPreview.id = 'brushPreview';
brushPreview.style.position = 'absolute';
brushPreview.style.pointerEvents = 'none';
brushPreview.style.borderRadius = '50%';
brushPreview.style.border = '1px solid #000000'; // Optional: Outline to help see the brush on different backgrounds

let drawing = false;
let currentX = 0;
let currentY = 0;
let brushSize = 10;
let brushColor = '#000000';
let gridDensity = 0;
let snapToGrid = false;
const historyStack = [];
const maxHistorySteps = 500;

// Reference to the grid toggle button
const toggleGridButton = document.getElementById('toggleGridButton');
toggleSnapButton.id = 'toggleSnapButton';
toggleSnapButton.style.display = 'none';
toggleSnapButton.textContent = 'Snap OFF';
document.body.appendChild(toggleSnapButton);

let snapToGridEnabled = false;

// Define the different grid densities and the corresponding icons
const gridDensities = ['grid-hidden', 'grid-density-1', 'grid-density-2', 'grid-density-3'];
const gridIcons = ['grid_off', 'grid_on', 'grid_view', 'view_comfy'];
let currentGridIndex = 0;

// Event listener to toggle grid visibility and density
toggleGridButton.addEventListener('click', () => {
  // Remove the current grid class
  drawingCanvas.classList.remove(gridDensities[currentGridIndex]);

  // Update the index for the next grid density (cyclically)
  currentGridIndex = (currentGridIndex + 1) % gridDensities.length;

  // Add the new grid class to the canvas
  drawingCanvas.classList.add(gridDensities[currentGridIndex]);

  // Update the icon on the button
  toggleGridButton.querySelector('span').textContent = gridIcons[currentGridIndex];

  // Show or hide the snap button based on grid visibility
  if (currentGridIndex === 0) {
    toggleSnapButton.style.display = 'none'; // Hide snap button when grid is hidden
  } else {
    toggleSnapButton.style.display = 'block'; // Show snap button when grid is visible
  }
});

// Event listener to toggle snap-to-grid functionality
toggleSnapButton.addEventListener('click', () => {
  snapToGridEnabled = !snapToGridEnabled;
  toggleSnapButton.textContent = snapToGridEnabled ? 'Snap ON' : 'Snap OFF';
});

canvas.addEventListener('mousedown', (e) => {
  drawing = true;
  realtimeListenerActive = false; // Disable real-time loading during drawing

  const [mouseX, mouseY] = getMousePosition(e);
  [currentX, currentY] = [mouseX, mouseY];
});

canvas.addEventListener('mousemove', (e) => { 
  const mouseX = e.offsetX; // Relative to canvas
  const mouseY = e.offsetY;
  updateBrushPreview(e.clientX, e.clientY);
  updateCursorIndicators(mouseX, mouseY);
  if (drawing) { // Only draw when the mouse is down
    const [mouseX, mouseY] = getMousePosition(e);
    drawLine(currentX, currentY, mouseX, mouseY);
    [currentX, currentY] = [mouseX, mouseY];
  }
});

canvas.addEventListener('mouseup', () => {
  drawing = false;
  saveCanvasState(); // Save canvas state when the line is ended
  realtimeListenerActive = true; // Re-enable real-time loading after saving
});

canvas.addEventListener('mouseout', () => {
  drawing = false;
  realtimeListenerActive = true;
});
function getMousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  let mouseX = Math.round(event.clientX - rect.left);
  let mouseY = Math.round(event.clientY - rect.top);

  if (snapToGridEnabled) {
    const gridSize = getGridSize();
    mouseX = Math.round(mouseX / gridSize) * gridSize;
    mouseY = Math.round(mouseY / gridSize) * gridSize;
  }

  return [mouseX, mouseY];
}

function getGridSize() {
  switch (currentGridIndex) {
    case 1:
      return 50; // Grid density 1
    case 2:
      return 25; // Grid density 2
    case 3:
      return 10; // Grid density 3
    default:
      return 1; // No grid
  }
}

// Scroll wheel to adjust brush size
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY < 0) {
    brushSize = Math.min(brushSize + 1, 100); // Limit max brush size to 100
  } else {
    brushSize = Math.max(brushSize - 1, 1); // Limit min brush size to 1
  }
  ctx.lineWidth = brushSize;
  updateBrushPreview(); // Update brush preview size
});

// Right click to open color picker
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  createRadialColorPicker(e.clientX, e.clientY);
});

// Clear canvas
clearButton.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showInfoMessage('Tabule smazána');
  autoSaveDrawing();
});

downloadButton.addEventListener('click', () => {
  // Create a temporary canvas
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // Set the dimensions same as the original canvas
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  // Fill the temporary canvas with a white background
  tempCtx.fillStyle = '#ffffff';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Draw the original canvas on top of the white background
  tempCtx.drawImage(canvas, 0, 0);

  // Generate the image data URL from the temporary canvas
  const dataURL = tempCanvas.toDataURL('image/png');

  // Create a link to download the image
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'drawing.png';
  link.click();

  // Show a message to the user
  showInfoMessage('Obrázek stažen');
});

// Initialize periodic loading after the window has loaded
window.addEventListener('load', () => {
  loadDrawing(); // Initial load on page load

  // Start the periodic loading timer
  const LOAD_INTERVAL = 2000; // 5 seconds
  setInterval(() => {
    if (!drawing) { // Only load if the user is not drawing
      loadDrawing();
    }
  }, LOAD_INTERVAL);
});

function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);

  ctx.stroke();
  ctx.closePath();
}

let saveTimeout;

function saveCanvasState() {
  clearTimeout(saveTimeout); // Clear any previous timeout
  saveTimeout = setTimeout(() => {
    const dataURL = canvas.toDataURL('image/png');
    
    // Add to Firebase
    database.ref('drawings/autoSave').set({
      imageData: dataURL,
      timestamp: Date.now()
    }, (error) => {
      if (error) {
        showInfoMessage('Chyba uložení: ' + error);
      } else {
        showInfoMessage('Uloženo');
      }
    });
  }, 500); // Throttle saving to every 500ms
}

function undo() {
  if (historyStack.length > 1) { // Ensure there's a previous state to revert to
      historyStack.pop(); // Remove the current state
      const previousState = historyStack[historyStack.length - 1]; // Get the previous state

      // Temporarily disable real-time loading to prevent reloading after undo
      realtimeListenerActive = false;

      const img = new Image();
      img.src = previousState;
      img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          showInfoMessage('Step back');

          // Re-enable real-time loading after a short delay to prevent immediate reload
          setTimeout(() => {
              realtimeListenerActive = true;
          }, 500); // Adjust delay as needed
      };
  } else {
      showInfoMessage('No more steps to undo.');
  }
}

const undoButton = document.getElementById('undoButton');
undoButton.addEventListener('click', undo);

// Load the canvas state from Firebase/*
/*
function loadCanvasFromFirebase() {
  if (!realtimeListenerActive) return;

// Replace `loadCanvasFromFirebase()` call with a persistent listener
database.ref('drawings/autoSave').on('value', (snapshot) => {
  if (!drawing) { // Only update if the user is not currently drawing
    const data = snapshot.val();
    if (data && data.imageData) {
      const img = new Image();
      img.src = data.imageData;
      img.onload = () => {
         ctx.drawImage(img, 0, 0);
        showInfoMessage('Aktualizováno');
      };
    }
  }
});

}*/
function updateBrushPreview(mouseX, mouseY) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Calculate position relative to the canvas, adjusted for device pixel ratio if necessary
  const canvasX = (mouseX - rect.left) * dpr;
  const canvasY = (mouseY - rect.top) * dpr;

  // Update the size and position of the brush preview
  brushPreview.style.width = `${brushSize}px`;
  brushPreview.style.height = `${brushSize}px`;
  brushPreview.style.backgroundColor = brushColor;

  // Position the brush preview directly based on mouse position, without additional canvas adjustments
  brushPreview.style.left = `${mouseX - brushSize / 2}px`;
  brushPreview.style.top = `${mouseY - brushSize / 2}px`;
}


function showInfoMessage(message) {
  infoMessage.innerHTML = `<span class="material-symbols-outlined green-checkmark">check</span> ${message}`;

  infoMessage.style.position = 'fixed';
  infoMessage.style.bottom = '20px';
  infoMessage.style.left = '20px'; 
  infoMessage.style.padding = '10px';
  infoMessage.style.borderRadius = '5px';
  infoMessage.style.opacity = '1';

  setTimeout(() => {
    infoMessage.style.transition = 'opacity 1s';
    infoMessage.style.opacity = '0';
  }, 500);
}


function autoSaveDrawing() {
  const dataURL = canvas.toDataURL();
  const drawingRef = database.ref('drawings/autoSave');
  drawingRef.set({
    imageData: dataURL,
    timestamp: Date.now()
  }, (error) => {
    if (error) {
      showInfoMessage('Chyba uložení: ' + error);
    } else {
      showInfoMessage('Uloženo');
    }
  });
}
let lastLoadedTimestamp = 0; // Initialize to track the last loaded drawing

function loadDrawing() {
  database.ref('drawings/autoSave').once('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.imageData) {
      if (data.timestamp && data.timestamp > lastLoadedTimestamp) { // Check if the drawing is newer
        lastLoadedTimestamp = data.timestamp; // Update the last loaded timestamp
        
        const drawingData = data.imageData;
        const img = new Image();
        img.src = drawingData;
        img.onload = () => {
          // Clear the current canvas before loading the new drawing
           ctx.drawImage(img, 0, 0);
          showInfoMessage('Drawing updated from server.');
          loadingOverlay.style.display = 'none'; // Hide the loading overlay when ready

        };
      } else {
        console.log('No new drawing to load.');
      }
    } else {
      showInfoMessage('No saved drawing found.');
    }
  });
}

function createRadialColorPicker(x, y) {
  // Remove existing picker if any
  const existingPicker = document.getElementById('radialColorPicker');
  if (existingPicker) {
    existingPicker.remove();
  }

  // Create container for the SVG color picker
  const pickerContainer = document.createElement('div');
  pickerContainer.id = 'radialColorPicker';
  pickerContainer.style.position = 'fixed';
  pickerContainer.style.left = `${x - 150}px`;
  pickerContainer.style.top = `${y - 150}px`;
  pickerContainer.style.width = '300px';
  pickerContainer.style.height = '300px';
  pickerContainer.style.pointerEvents = 'auto';
  pickerContainer.style.zIndex = '1000';
  pickerContainer.style.transition = 'opacity 0.5s ease-in-out, filter 0.5s ease-in-out';
  pickerContainer.style.opacity = '0';
  pickerContainer.style.filter = 'blur(10px)';
  document.body.appendChild(pickerContainer);

  // Create SVG element to hold the color wheel
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '300');
  svg.setAttribute('height', '300');
  svg.setAttribute('viewBox', '0 0 300 300');
  pickerContainer.appendChild(svg);

  // Fade in the color picker with blur effect
  setTimeout(() => {
    pickerContainer.style.opacity = '1';
    pickerContainer.style.filter = 'blur(0)';
  }, 10);

  // Create central brush preview that fills the max radius
  const brushPreviewCircle = document.createElementNS(svgNS, 'circle');
  brushPreviewCircle.setAttribute('cx', '150');
  brushPreviewCircle.setAttribute('cy', '150');
  brushPreviewCircle.setAttribute('r', '100'); // Max radius for the preview
  brushPreviewCircle.setAttribute('fill', '#ccc'); // Default gray color for preview
  svg.appendChild(brushPreviewCircle);

  const numRings = 6; // Increased from 5 to 6 to add grayscale ring
  const segmentsPerRing = 24; // Number of segments per ring

  for (let ringIndex = 0; ringIndex < numRings; ringIndex++) {
    const innerRadius = 30 + (ringIndex * 20);
    const outerRadius = innerRadius + 20; // The thickness of each ring

    if (ringIndex === numRings - 1) {
      // Grayscale ring
      const hue = 0;
      const saturation = 0; // Grayscale
      for (let segmentIndex = 0; segmentIndex < segmentsPerRing; segmentIndex++) {
        const startAngle = (segmentIndex * 360) / segmentsPerRing;
        const endAngle = ((segmentIndex + 1) * 360) / segmentsPerRing;
        const lightness = 100 - (segmentIndex * (100 / segmentsPerRing));

        // Create the path element
        const path = document.createElementNS(svgNS, 'path');
        const d = describeArc(150, 150, innerRadius, outerRadius, startAngle, endAngle);
        path.setAttribute('d', d);
        path.setAttribute('fill', `hsl(${hue}, ${saturation}%, ${lightness}%)`);
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', '1');
        path.style.transition = 'filter 0.2s ease-in-out';

        // Event to preview color in the brush preview circle
        path.addEventListener('mouseenter', () => {
          brushPreviewCircle.setAttribute('fill', `hsl(${hue}, ${saturation}%, ${lightness}%)`);
          // Add blurred shadow effect on hover
          path.style.filter = `drop-shadow(0px 0px 10px hsl(${hue}, ${saturation}%, ${lightness}%))`;
        });

        // Remove shadow effect when not hovering
        path.addEventListener('mouseleave', () => {
          path.style.filter = 'none';
        });

        // Set color on click and remove picker
        path.addEventListener('click', () => {
          brushColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
          ctx.strokeStyle = brushColor;
          pickerContainer.style.opacity = '0';
          pickerContainer.style.filter = 'blur(10px)';
          setTimeout(() => {
            pickerContainer.remove();
          }, 500);
        });

        svg.appendChild(path);
      }
    } else {
      const ringLightness = 80 - ringIndex * 10; // Adjust lightness

      for (let segmentIndex = 0; segmentIndex < segmentsPerRing; segmentIndex++) {
        const startAngle = (segmentIndex * 360) / segmentsPerRing;
        const endAngle = ((segmentIndex + 1) * 360) / segmentsPerRing;
        const hue = (segmentIndex * 360) / segmentsPerRing;

        // Create the path element for the pie slice segment
        const path = document.createElementNS(svgNS, 'path');
        const d = describeArc(150, 150, innerRadius, outerRadius, startAngle, endAngle);
        path.setAttribute('d', d);
        path.setAttribute('fill', `hsl(${hue}, 100%, ${ringLightness}%)`);
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', '1');
        path.style.transition = 'filter 0.2s ease-in-out';

        // Event to preview color in the brush preview circle
        path.addEventListener('mouseenter', () => {
          brushPreviewCircle.setAttribute('fill', `hsl(${hue}, 100%, ${ringLightness}%)`);
          // Add blurred shadow effect on hover
          path.style.filter = `drop-shadow(0px 0px 10px hsl(${hue}, 100%, ${ringLightness}%))`;
        });

        // Remove shadow effect when not hovering
        path.addEventListener('mouseleave', () => {
          path.style.filter = 'none';
        });

        // Set color on click and remove picker
        path.addEventListener('click', () => {
          brushColor = `hsl(${hue}, 100%, ${ringLightness}%)`;
          ctx.strokeStyle = brushColor;
          pickerContainer.style.opacity = '0';
          pickerContainer.style.filter = 'blur(10px)';
          setTimeout(() => {
            pickerContainer.remove();
          }, 500);
        });

        svg.appendChild(path);
      }
    }
  }

  // Clicking outside the picker closes it
  window.addEventListener('click', (e) => {
    if (e.target !== pickerContainer && !pickerContainer.contains(e.target)) {
      pickerContainer.style.opacity = '0';
      pickerContainer.style.filter = 'blur(10px)';
      setTimeout(() => {
        if (pickerContainer.parentElement) {
          pickerContainer.parentElement.removeChild(pickerContainer);
        }
      }, 500);
    }
  });
}

// Utility function to describe an arc path
function describeArc(x, y, innerRadius, outerRadius, startAngle, endAngle) {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  return [
    "M", startOuter.x, startOuter.y,
    "A", outerRadius, outerRadius, 0, endAngle - startAngle > 180 ? 1 : 0, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, endAngle - startAngle > 180 ? 1 : 0, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ");
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}
// Create rulers
const horizontalRuler = document.createElement('div');
horizontalRuler.id = 'horizontalRuler';
document.body.appendChild(horizontalRuler);

const verticalRuler = document.createElement('div');
verticalRuler.id = 'verticalRuler';
document.body.appendChild(verticalRuler);

// Position rulers around canvas
horizontalRuler.style.top = `${canvas.offsetTop}px`;
horizontalRuler.style.left = `${canvas.offsetLeft}px`;
horizontalRuler.style.width = `${canvas.width}px`;

verticalRuler.style.top = `${canvas.offsetTop}px`;
verticalRuler.style.left = `${canvas.offsetLeft}px`;
verticalRuler.style.height = `${canvas.height}px`;

// Fill the horizontal ruler with tick marks and numbers
for (let i = 0; i <= canvas.width; i += 5) {
  const tick = document.createElement('div');
  tick.className = 'ruler-tick';
  tick.style.width = '1px';
  tick.style.height = i % 50 === 0 ? '15px' : i % 10 === 0 ? '5px' : '5px';
  tick.style.left = `${i}px`;
  tick.style.top = '0';
  horizontalRuler.appendChild(tick);

  // Add numbers at every 100 pixels, centered below tick mark
  if (i % 100 === 0 && i > 0) {
    const label = document.createElement('div');
    label.className = 'ruler-number';
    label.style.bottom = '8px';
    label.style.left = `${i - 30}px`;

    label.style.width = `30px`;
    label.textContent = i;
    horizontalRuler.appendChild(label);
  }
}

// Fill the vertical ruler with tick marks and numbers
for (let i = 0; i <= canvas.height; i += 5) {
  const tick = document.createElement('div');
  tick.className = 'ruler-tick';
  tick.style.height = '1px';
  tick.style.width = i % 50 === 0 ? '15px' : i % 10 === 0 ? '5px' : '5px';
  tick.style.top = `${i}px`;
  tick.style.left = '0';
  verticalRuler.appendChild(tick);

  // Add numbers at every 100 pixels, centered beside tick mark
  if (i % 100 === 0 && i > 0) {
    const label = document.createElement('div');
    label.className = 'ruler-number';
    label.style.top = `${i - 10}px`;
    label.style.right = '8px';
    label.textContent = i;
    verticalRuler.appendChild(label);
  }
}
function updateCursorIndicators(x, y) {
  // Update the position of red cursor indicators on rulers
  cursorXTick.style.left = `${canvas.offsetLeft + x}px`; // Adjust based on canvas offset
  cursorXTick.style.top = `${canvas.offsetTop - 60}px`; // Positioned above the canvas

  cursorYTick.style.left = `${canvas.offsetLeft - 60}px`; // Positioned left of the canvas
  cursorYTick.style.top = `${canvas.offsetTop + y}px`; // Adjust based on canvas offset

  // Update the numerical position below the tick, rounded values
  cursorXTick.textContent = `${x}`;
  cursorXTick.style.transform = `translateX(-50%)`; // Center below the tick

  cursorYTick.textContent = `${y}`;
  cursorYTick.style.transform = `translateY(-50%)`; // Center beside the tick
}  
// Position and resize rulers based on canvas dimensions
function positionRulers() {
  // Position the horizontal ruler at the top of the canvas
  horizontalRuler.style.position = 'absolute';
  horizontalRuler.style.top = `${canvas.offsetTop}px`;
  horizontalRuler.style.left = `${canvas.offsetLeft}px`;
  horizontalRuler.style.width = `${canvas.width}px`;

  // Position the vertical ruler to the left of the canvas
  verticalRuler.style.position = 'absolute';
  verticalRuler.style.top = `${canvas.offsetTop}px`;
  verticalRuler.style.left = `${canvas.offsetLeft}px`;
  verticalRuler.style.height = `${canvas.height}px`;
}

// Call this function on page load to ensure correct initial positioning
window.addEventListener('load', positionRulers);

// Call this function on window resize to keep rulers aligned
window.addEventListener('resize', positionRulers);

// If your canvas dimensions change dynamically in code, make sure to call positionRulers() after changing them
function resizeCanvas(newWidth, newHeight) {
  canvas.width = newWidth;
  canvas.height = newHeight;
  positionRulers();
}

/* --- Loading Animation --- */
// Create loading overlay
const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'loadingOverlay';
loadingOverlay.innerHTML = '<div class="loader"></div>'; // You can style this loader as per your preference
document.body.appendChild(loadingOverlay);

// CSS styles for loading overlay and loader (You can place this in your CSS file)
const style = document.createElement('style');
style.innerHTML = `
  #loadingOverlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255,255,255,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .loader {
    border: 16px solid #f3f3f3; /* Light grey */
    border-top: 16px solid #3498db; /* Blue */
    border-radius: 50%;
    width: 120px;
    height: 120px;
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
/* --- End of Loading Animation --- */