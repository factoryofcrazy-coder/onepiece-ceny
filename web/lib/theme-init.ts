// Spoločné pre server (layout) aj klienta.
export const THEME_KEY = "op-theme";
export const THEME_INIT = `try{if(localStorage.getItem("${THEME_KEY}")==="soft")document.documentElement.dataset.theme="soft"}catch(e){}`;
