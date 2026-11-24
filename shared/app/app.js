const $ = (s) => document.querySelector(s);
const cart = [];

function total(items) {
  return items.reduce((sum, p) => sum + p.price, 0);
}

$('#open-login').addEventListener('click', () => { $('#login').hidden = false; });

$('#login').addEventListener('submit', (e) => {
  e.preventDefault();
  $('#login').hidden = true;
  $('#shop').hidden = false;
  $('#hello').textContent = 'Здравей, ' + $('#user').value;
});

document.querySelectorAll('[data-testid^="add-"]').forEach((b) => {
  b.addEventListener('click', () => {
    cart.push({ price: Number(b.dataset.price) });
    $('#total').textContent = total(cart).toFixed(2).replace('.', ',');
  });
});
