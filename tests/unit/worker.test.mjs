import { check, done, fakeStorage } from './lib.mjs';

fakeStorage();
const { roomyConnection } = await import('../../src/app/worker.js');

check('without connection details the rest is fetched', roomyConnection(null) === true);
check('a fast connection fetches the rest', roomyConnection({ effectiveType: '4g', saveData: false }) === true);
check('Save-Data never fetches ahead', roomyConnection({ effectiveType: '4g', saveData: true }) === false);
check('3G waits for each screen to be opened', roomyConnection({ effectiveType: '3g' }) === false);
check('so do 2G and slow 2G', roomyConnection({ effectiveType: '2g' }) === false && roomyConnection({ effectiveType: 'slow-2g' }) === false);

done();
