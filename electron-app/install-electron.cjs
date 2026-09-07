const { download } = require('@electron/get');
download({ version: '33.4.11' })
  .then(path => console.log('OK:', path))
  .catch(e => console.error('ERR:', e.message));
