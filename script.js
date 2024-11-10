const firebaseConfig = {
  databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();// Get references to DOM elements
const canvas = document.getElementById('drawingCanvas');
canvas.width = 1000;//a
canvas.height = 600;
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
document.body.appendChild(cursorXTick);
let mouseX = 0;
let mouseY = 0;
const cursorYTick = document.createElement('div');
cursorYTick.id = 'cursorY'; 
document.body.appendChild(cursorYTick);
// Create brush preview element
const brushPreview = document.createElement('div');
document.body.appendChild(brushPreview);
brushPreview.id = 'brushPreview';
brushPreview.style.position = 'absolute';
brushPreview.style.pointerEvents = 'none';
brushPreview.style.borderRadius = '50%';
 
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
// Mouse Events
canvas.addEventListener('mousedown', (e) => {
  drawing = true;
  realtimeListenerActive = false;
  const [mouseX, mouseY] = getMousePosition(e);
  [currentX, currentY] = [mouseX, mouseY];
});

canvas.addEventListener('mousemove', (e) => {
  const mouseX = e.offsetX; // Relative to canvas
  const mouseY = e.offsetY;
  updateBrushPreview(e.clientX, e.clientY);

  if (drawing) {
      updateBrushPreview();

    const [mouseX, mouseY] = getMousePosition(e);
    drawLine(currentX, currentY, mouseX, mouseY);
    [currentX, currentY] = [mouseX, mouseY];
  }
});

canvas.addEventListener('mouseup', () => {
  drawing = false;      autoSaveDrawing();
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
/* --- Touch Event Handlers --- */

// Touch Events
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  drawing = true;
  realtimeListenerActive = false;
  const [touchX, touchY] = getTouchPosition(e);
  [currentX, currentY] = [touchX, touchY];
});

// Touch move event
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault(); // Prevent scrolling when touching the canvas
  const touch = e.touches[0];
  const touchX = touch.clientX - canvas.offsetLeft;
  const touchY = touch.clientY - canvas.offsetTop;
  updateBrushPreview(touch.clientX, touch.clientY);
  
  if (drawing) { // Only draw when touch is active
    const [touchX, touchY] = getTouchPosition(e);
    drawLine(currentX, currentY, touchX, touchY);
    [currentX, currentY] = [touchX, touchY];
  }
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  drawing = false;
   realtimeListenerActive = true;
   autoSaveDrawing();
});
// Touch cancel event
canvas.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  drawing = false;
  realtimeListenerActive = true;
});

// Function to get touch position relative to the canvas
function getTouchPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const touch = event.touches[0] || event.changedTouches[0];
  let touchX = Math.round(touch.clientX - rect.left);
  let touchY = Math.round(touch.clientY - rect.top);

  if (snapToGridEnabled) {
    const gridSize = getGridSize();
    touchX = Math.round(touchX / gridSize) * gridSize;
    touchY = Math.round(touchY / gridSize) * gridSize;
  }

  return [touchX, touchY];
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
   autoSaveDrawing();
  showInfoMessage('Tabule smazána');
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
 

// Set these properties once for smooth lines
ctx.lineJoin = 'round';
ctx.lineCap = 'round';
ctx.lineWidth = 2;  // Adjust as needed for smoother lines

function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

let saveTimeout;

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
      showInfoMessage('Saved');
      loadingOverlay.style.display = 'none';

    }
  });
}
// Use real-time listener
database.ref('drawings/autoSave').on('value', (snapshot) => {
  if (!drawing) {
    autoSaveDrawing();
  }
}); 
 
 
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
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Clear the current canvas before loading the new drawing
           ctx.drawImage(img, 0, 0);
          showInfoMessage('Updated');
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
  tick.style.height = i % 100 === 0 ? '15px' : '5px';
  tick.style.left = `${i}px`;
  tick.style.top = '0';
  horizontalRuler.appendChild(tick);

  // Add numbers at every 100 pixels, centered below tick mark
  if (i % 100 === 0 && i > 0) {
    const label = document.createElement('div');
    label.className = 'ruler-number';
    label.style.bottom = '-18px';
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
  tick.style.width = i % 100 === 0 ? '20px' : '5px';
  tick.style.top = `${i}px`;
  tick.style.left = '0';
  verticalRuler.appendChild(tick);

  // Add numbers at every 100 pixels, centered beside tick mark
  if (i % 100 === 0 && i > 0) {
    const label = document.createElement('div');
    label.className = 'ruler-number';
    label.style.top = `${i - 10}px`;
    label.style.right = '-24px';
    label.textContent = i;
    verticalRuler.appendChild(label);
  }
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
// JavaScript to handle the button
const colorPickerButton = document.getElementById('colorPickerButton');

colorPickerButton.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation(); // Prevent the event from bubbling up

  // Calculate the center of the screen
  const x = window.innerWidth / 2;
  const y = window.innerHeight / 2;

  // Position the color picker in the center of the screen
  createRadialColorPicker(x, y);
});


const brushSizeSlider = document.getElementById('brushSizeSlider');
 
brushSizeSlider.addEventListener('input', () => {
  brushSize = parseInt(brushSizeSlider.value, 10);
  ctx.lineWidth = brushSize;
  updateBrushPreview();
});

// Prevent zooming via keyboard
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
    e.preventDefault();
  }
}, { passive: false });

// Prevent zooming via mouse wheel
document.addEventListener('wheel', function (e) {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

let lastTouchEnd = 0;

document.addEventListener('touchend', function (e) {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });
