// backend/services/gcsUploader.js
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const storage = new Storage({
  keyFilename: path.join(__dirname, "../config/luminous-lodge-466913-n1-c0a750ea52df.json"),
});
const bucket = storage.bucket(process.env.BUCKET_PUBLIC || "test_bucket-2004");

function slug(s) { return String(s||'').trim().replace(/\s+/g,' '); }

async function uploadToGCS(file, carId, carMaker, carModel, carYear, carPart) {
  const maker = slug(carMaker), model = slug(carModel), year = String(carYear||'').trim();
  const part = String(carPart||'unsorted').toLowerCase();

  let fileName;
  if (part === "exterior" || part === "interior" || part === "main" || part === "unsorted") {
    fileName = `cars/${maker}/${model} ${year}/${part}/${file.originalname}`;
  } else {
    // fallback
    fileName = `cars/${maker}/${model} ${year}/unsorted/${file.originalname}`;
  }

  const blob = bucket.file(fileName);
  const stream = blob.createWriteStream({ resumable: false, contentType: file.mimetype });

  return new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.on("finish", () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    });
    stream.end(file.buffer);
  });
}
module.exports = uploadToGCS;
