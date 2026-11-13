import { test, expect } from '@playwright/test';

const selectedDate = '2026-09-12';
const deleteLabel = 'Eliminar cierre de la fecha seleccionada';

// Mount the real POS report against an in-browser store; never contact production.
async function fixture(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/src/tenantSession.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const getActiveTenant = () => null;',
  }));
  await page.route('**/src/paymentsStore.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const closes = new Map(['2026-09-12', '2026-09-13'].map(dateISO => [dateISO, {dateISO}]));
      const payments = [{id:'payment-1',createdAt:'2026-09-12T17:00:00Z',method:'EFECTIVO',
        subtotal:15000,tipAmount:0,totalWithTip:15000,paidAmount:15000,
        items:[{name:'Producto de prueba',qty:1,line_total:15000}]}];
      window.closeFixture = {closes,payments,deletes:[],fail:false,hold:false};
      export async function loadPayments() { return payments; }
      export async function loadDailyClose(date) { return closes.get(date) || null; }
      export async function saveDailyClose(close) { closes.set(close.dateISO,close); return close; }
      export async function deleteDailyClose(date) {
        window.closeFixture.deletes.push(date);
        if (window.closeFixture.hold) await new Promise(resolve => {window.closeFixture.release=resolve;});
        if (window.closeFixture.fail) throw new Error('network failure');
        closes.delete(date);
        return 'deleted-close';
      }
    `,
  }));
  // No Supabase connection is expected for this isolated component.
  await page.route('https://**/*', route => route.abort());
  await page.route('**/__daily-close-test', route => route.fulfill({
    contentType: 'text/html',
    body: `<div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      const {default:React} = await import('/node_modules/.vite/deps/react.js');
      const {default:ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default:DailyReport} = await import('/src/DailyReport.jsx');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DailyReport,{onBack:()=>{}}));
    </script>`,
  }));
  await page.goto('/__daily-close-test');
  await expect.poll(async () => {
    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
    return page.locator('input[type=date]').count();
  }).toBe(1);
  await page.locator('input[type=date]').fill(selectedDate);
  await expect(page.getByRole('button', {name:deleteLabel})).toBeEnabled();
}

test('POS: cancelar o eliminar solo el cierre seleccionado y regenerarlo con sus pagos', async ({page}) => {
  await fixture(page);
  const button = page.getByRole('button', {name:deleteLabel});
  await expect(page.getByRole('button', {name:'Borrar historial de pagos'})).toHaveCount(0);
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain(selectedDate);
    expect(dialog.message()).toContain('Los pagos y los cierres de otras fechas se conservarán');
    await dialog.dismiss();
  });
  await button.click();
  expect(await page.evaluate(() => window.closeFixture.deletes)).toEqual([]);
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => {window.closeFixture.hold=true;});
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator('input[type=date]')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Recargar'})).toBeDisabled();
  await expect.poll(() => page.evaluate(() => Boolean(window.closeFixture.release))).toBe(true);
  await page.evaluate(() => window.closeFixture.release());
  await expect(page.getByRole('button',{name:'Generar cierre diario'})).toBeEnabled();
  await expect(button).toBeDisabled();
  await expect(page.getByText('1 × Producto de prueba',{exact:true})).toBeVisible();
  expect(await page.evaluate(() => ({
    dates:[...window.closeFixture.closes.keys()],
    deletes:window.closeFixture.deletes,
    payments:window.closeFixture.payments.length,
  }))).toEqual({dates:['2026-09-13'],deletes:[selectedDate],payments:1});
  await page.getByRole('button',{name:'Generar cierre diario'}).click();
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => window.closeFixture.closes.get('2026-09-12').payments.length)).toBe(1);
  await page.locator('input[type=date]').fill('2026-09-14');
  await expect(button).toBeDisabled();
});

test('POS: fallo de eliminación exige recargar antes de reintentar', async ({page}) => {
  await fixture(page);
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.accept(); });
  await page.evaluate(() => {window.closeFixture.fail=true;});
  await page.getByRole('button',{name:deleteLabel}).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar la eliminación');
  await expect(page.getByRole('button',{name:deleteLabel})).toBeDisabled();
  expect(dialogs).toHaveLength(1); // Confirmation only; no false success alert.
  expect(await page.evaluate(() => window.closeFixture.closes.size)).toBe(2);
  await expect(page.getByText('1 × Producto de prueba',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Recargar'}).click();
  await expect(page.getByRole('button',{name:deleteLabel})).toBeEnabled();
});
