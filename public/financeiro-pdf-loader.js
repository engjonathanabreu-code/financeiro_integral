(function () {
  const root = new URL('vendor/pdfjs/', document.currentScript.src);
  let loading;
  window.IntegralFinancePdf = {
    load() {
      if (!loading) {
        loading = import(new URL('legacy/build/pdf.min.mjs', root).href).then(pdfjs => {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL('legacy/build/pdf.worker.min.mjs', root).href;
          return pdfjs;
        }).catch(error => {
          loading = undefined;
          throw error;
        });
      }
      return loading;
    },
    options: Object.freeze({
      cMapUrl: new URL('cmaps/', root).href,
      cMapPacked: true,
      iccUrl: new URL('iccs/', root).href,
      standardFontDataUrl: new URL('standard_fonts/', root).href,
      wasmUrl: new URL('wasm/', root).href,
      isEvalSupported: false,
    }),
  };
})();
