const button = document.querySelector('.menu-button');
const navigation = document.querySelector('#navigation');
function setMenu(open) {
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Close' : 'Menu';
  navigation.classList.toggle('open', open);
}
button.addEventListener('click', () => setMenu(button.getAttribute('aria-expanded') !== 'true'));
navigation.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    button.focus();
  }
});
