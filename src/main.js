const cursor = document.querySelector('.cursor');

const X_OFFSET = 50; 
const Y_OFFSET = 50; 

const moveCursor = (e) => {
  let clientX, clientY;

  // Handle touch events (for iOS)
  if (e.touches && e.touches.length) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } 
  else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  cursor.style.transform = `translate3d(${clientX - X_OFFSET}px, ${clientY - Y_OFFSET}px, 0)`;
}

window.addEventListener('mousemove', moveCursor);
window.addEventListener('touchmove', moveCursor);