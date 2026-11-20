/**
 * Script que corre antes de pintar la pagina para aplicar el tema guardado.
 * Evita el destello blanco al cargar en modo oscuro.
 */
export function ThemeScript({ theme }: { theme: string }) {
  const code = `(function(){try{var t=${JSON.stringify(theme)};var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t==='system'&&m);var r=document.documentElement;if(dark)r.classList.add('dark');r.dataset.theme=t;}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
