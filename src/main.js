const cursor = document.querySelector('.cursor');

const X_OFFSET = 50;
const Y_OFFSET = 50;

const moveCursor = (e) => {
  const mouseY = e.clientY;
  const mouseX = e.clientX;

  cursor.style.transform = `translate3d(${mouseX - X_OFFSET}px, ${mouseY - Y_OFFSET}px, 0)`;
}

window.addEventListener('mousemove', moveCursor);