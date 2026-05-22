export function openPrintWindow(html, title = "print") {
  const w = window.open("", title, "width=420,height=700");
  if (!w) {
    alert("El navegador bloqueó la ventana emergente. Permite popups para imprimir.");
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  w.focus();

  // Esperar un poco para que cargue estilos
  setTimeout(() => {
    w.print();
    w.close();
  }, 250);
}
