// backend/services/gcsUploader.js
const { bucketPublic } = require('./gcs'); // <<< use the shared module

function slug(s) { return String(s||'').trim().replace(/\s+/g,' '); }

async function uploadToGCS(file, carId, carMaker, carModel, carYear, carPart) {
  const maker = slug(carMaker), model = slug(carModel), year = String(carYear||'').trim();
  const part = String(carPart||'unsorted').toLowerCase();

  const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
  const fileName =
    (part === 'main' || part === 'exterior' || part === 'interior' || part === 'unsorted')
      ? `cars/${maker}/${model} ${year}/${part}/${safeName}`
      : `cars/${maker}/${model} ${year}/unsorted/${safeName}`;

  const blob = bucketPublic.file(fileName);
  const stream = blob.createWriteStream({ resumable: false, contentType: file.mimetype });

  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${blob.bucket.name}/${blob.name}`;
      resolve(publicUrl);
    });
    stream.end(file.buffer);
  });
}

module.exports = uploadToGCS;
