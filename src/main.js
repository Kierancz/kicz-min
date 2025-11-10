const BLOB_CLASS = 'blob'; 
const X_OFFSET = 50;
const Y_OFFSET = 50;

const createBlob = (clientX, clientY) => {
  const newBlob = document.createElement('div');
  newBlob.classList.add(BLOB_CLASS);
  document.querySelector('.filter-container').appendChild(newBlob);
  
  newBlob.style.transform = `translate3d(${clientX - X_OFFSET}px, ${clientY - Y_OFFSET}px, 0)`;
};


const handlePress = (e, shouldCreateBlob = true) => {
  let clientX, clientY;

  if (e.touches && e.touches.length) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } 
  else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  
  if (shouldCreateBlob) {
    createBlob(clientX, clientY);
  }
  
};

window.addEventListener('mousedown', handlePress);
window.addEventListener('touchstart', handlePress, { passive: true });
window.addEventListener('touchmove', (e) => handlePress(e, false));