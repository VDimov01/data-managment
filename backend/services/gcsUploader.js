const { Storage } = require("@google-cloud/storage");
const path = require("path");

const storage = new Storage({
  keyFilename: path.join(__dirname, "../config/luminous-lodge-466913-n1-c0a750ea52df.json"),
});

const bucket = storage.bucket(process.env.BUCKET_NAME_IMAGES || "test_bucket-2004");

async function uploadToGCS(file, carId, carMaker, carModel, carYear, carPart) {
  let fileName = `cars/${carMaker}/${carModel}/${file.originalname}`;
  if (carPart === "exterior") {
    fileName = `cars/${carMaker}/${carModel} ${carYear}/exterior/${file.originalname}`;
  } else if (carPart === "interior") {
    fileName = `cars/${carMaker}/${carModel} ${carYear}/interior/${file.originalname}`;
  } else if (carPart === "main") {
    fileName = `cars/${carMaker}/${carModel} ${carYear}/main/${file.originalname}`;
  }
  const blob = bucket.file(fileName);
  const stream = blob.createWriteStream({
    resumable: false,
    contentType: file.mimetype,
  });

  return new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.on("finish", () => {
      // Construct public URL
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    });

    stream.end(file.buffer);
  });
}

module.exports = uploadToGCS;
