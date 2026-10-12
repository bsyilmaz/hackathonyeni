// Arayüzün ana süreçle konuşabildiği tek kapı. Node erişimi arayüze açılmaz.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('kadroApi', {
  kadro: () => ipcRenderer.invoke('kadro'),
  ayarlar: () => ipcRenderer.invoke('ayarlar:al'),
  ayarlariKaydet: (d) => ipcRenderer.invoke('ayarlar:kaydet', d),
  kodDunyasiSec: () => ipcRenderer.invoke('kod-dunyasi:sec'),
  sosyalGiris: (platform) => ipcRenderer.invoke('sosyal:giris', platform),
  sosyalSonraki: () => ipcRenderer.invoke('sosyal:sonraki'),
  dinle: (ses) => ipcRenderer.invoke('dinle', ses),
  kulakHazirla: () => ipcRenderer.invoke('kulak:hazirla'),
  konus: (metin) => ipcRenderer.invoke('konus', metin),
  iptal: () => ipcRenderer.invoke('iptal'),
  onay: (id, karar, args) => ipcRenderer.invoke('onay', { id, karar, args }),
  onayDogrula: (id, args) => ipcRenderer.invoke('onay:dogrula', { id, args }),
  hatirlatmaErtele: (id, dk) => ipcRenderer.invoke('hatirlatma:ertele', { id, dk }),
  onaylar: () => ipcRenderer.invoke('onaylar'),
  sesDene: (ajanId, ses, motor) => ipcRenderer.invoke('ses:dene', { ajanId, ses, motor }),
  merhaba: () => ipcRenderer.invoke('merhaba'),
  disAc: (url) => ipcRenderer.invoke('dis:ac', url),
  dosyaYolu: (dosya) => webUtils.getPathForFile(dosya),
  belgeEkle: (yollar) => ipcRenderer.invoke('belge:ekle', yollar),
  belgeSec: () => ipcRenderer.invoke('belge:sec'),
  gorselGoster: (dosya) => ipcRenderer.invoke('gorsel:goster', dosya),
  gununIsi: () => ipcRenderer.invoke('gunun-isi:al'),
  gununIsiTamam: (tamam) => ipcRenderer.invoke('gunun-isi:tamam', tamam),
  odak: () => ipcRenderer.invoke('odak:al'),
  odakBitir: () => ipcRenderer.invoke('odak:bitir'),
  olay: (fn) => {
    const h = (_e, o) => fn(o);
    ipcRenderer.on('olay', h);
    return () => ipcRenderer.off('olay', h);
  },
});
