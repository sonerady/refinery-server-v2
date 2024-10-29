const express = require("express");
const supabase = require("../supabaseClient"); // Supabase client
const Replicate = require("replicate");
const multer = require("multer"); // Dosya yüklemek için kullanılıyor
const { v4: uuidv4 } = require("uuid");
const archiver = require("archiver"); // Zip dosyası oluşturmak için
const fs = require("fs"); // Dosya sistemine erişim için
const os = require("os"); // Geçici dizin için os modülü
const axios = require("axios"); // API istekleri için axios

const upload = multer(); // Geçici olarak bellekte tutmak için
const router = express.Router();

// Replicate API token'ını çevre değişkenlerinden alıyoruz
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Dosya upload, arka plan kaldırma, zip oluşturma ve eğitim işlemi
router.post("/generateTrain", upload.array("files", 10), async (req, res) => {
  const files = req.files;
  const { user_id } = req.body;

  if (!files || files.length === 0) {
    return res.status(400).json({ message: "Dosya gerekli." });
  }

  try {
    const publicUrls = [];
    const removeBgResults = [];

    // 1. Adım: Dosyaları Supabase'e yükleme
    for (const file of files) {
      const fileName = `${Date.now()}_${file.originalname}`;

      // Dosyayı Supabase bucket'ına yüklüyoruz
      const { data, error } = await supabase.storage
        .from("images")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
        });

      if (error) {
        throw error;
      }

      // Dosyanın herkese açık URL'sini alıyoruz
      const { data: publicUrlData, error: urlError } = await supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      if (urlError) {
        throw urlError;
      }

      publicUrls.push(publicUrlData.publicUrl);
    }

    // 2. Adım: URL'ler ile arka plan kaldırma işlemi (Photoroom API kullanarak)
    for (const url of publicUrls) {
      try {
        // Photoroom API ile arka planı kaldırıyoruz
        const response = await axios.get(
          `https://image-api.photoroom.com/v2/edit?background.color=white&background.scaling=fill&outputSize=2000x2000&padding=0.1&imageUrl=${url}`,
          {
            headers: {
              "x-api-key": "a47a67b0afc39b6f62b424d3564ff5761f9ccbb6",
            },
            responseType: "arraybuffer", // Resmi binary olarak almak için
          }
        );

        const imageData = Buffer.from(response.data, "binary");
        removeBgResults.push(imageData);
        console.log("Arka planı kaldırılan resim başarıyla alındı.");
      } catch (error) {
        console.error("Arka plan kaldırma işlemi başarısız:", error);
        removeBgResults.push({ error: error.message });
      }
    }

    // 4. Adım: Zip oluşturma ve Supabase'e yükleme
    const zipFileName = `images_${Date.now()}.zip`;
    const zipFilePath = `${os.tmpdir()}/${zipFileName}`;

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", async () => {
      console.log(
        `${archive.pointer()} toplam byte'lık zip dosyası oluşturuldu.`
      );

      const { data: zipData, error: zipError } = await supabase.storage
        .from("zips")
        .upload(zipFileName, fs.readFileSync(zipFilePath), {
          contentType: "application/zip",
        });

      if (zipError) {
        throw zipError;
      }

      const { data: zipUrlData, error: zipUrlError } = await supabase.storage
        .from("zips")
        .getPublicUrl(zipFileName);

      if (zipUrlError) {
        throw zipUrlError;
      }

      // 5. Adım: Eğitim işlemi başlatma (Replicate)
      const repoName = uuidv4()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_.]/g, "")
        .replace(/^-+|-+$/g, "");

      const model = await replicate.models.create("sonerady2", repoName, {
        visibility: "public",
        hardware: "gpu-a40-large",
      });

      const training = await replicate.trainings.create(
        "ostris",
        "flux-dev-lora-trainer",
        "6f1e7ae9f285cfae6e12f8c18618418cfefe24b07172a17ff10a64fb23a6b772",
        {
          destination: `sonerady2/${repoName}`,
          input: {
            steps: 1000,
            lora_rank: 20,
            optimizer: "adamw8bit",
            batch_size: 1,
            resolution: "512,768,1024",
            autocaption: true,
            input_images: zipUrlData.publicUrl,
            trigger_word: "TOK",
            learning_rate: 0.0004,
            autocaption_prefix: "a photo of TOK",
          },
        }
      );

      const replicateId = training.id;

      // Burada sadece ilk public URL'yi kaydediyoruz
      const { data: insertData, error: insertError } = await supabase
        .from("userproduct")
        .insert({
          user_id,
          product_id: replicateId,
          status: "pending",
          image_urls: JSON.stringify([publicUrls[0]]), // Sadece ilk resmi kaydediyoruz
        });

      if (insertError) {
        throw insertError;
      }

      if (training.status === "succeeded") {
        const replicateStatus = training.status;
        const replicateWeights = training.output.weights;
        const replicateError = training.error;

        const { data: updateData, error: updateError } = await supabase
          .from("userproduct")
          .update({
            status: replicateStatus,
            weights: replicateWeights,
            statusError: replicateError,
          })
          .eq("product_id", replicateId);

        if (updateError) {
          throw updateError;
        }
      }

      res.status(200).json({
        message: "Training initiated successfully",
        training,
        publicUrls,
        removeBgResults,
        zipUrl: zipUrlData.publicUrl,
      });
    });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);

    // Arka planı kaldırılmış resimleri zip'e ekleme
    for (const imageData of removeBgResults) {
      if (Buffer.isBuffer(imageData)) {
        archive.append(imageData, { name: `${uuidv4()}.png` });
      } else {
        console.error("Geçersiz resim verisi:", imageData);
      }
    }

    archive.finalize();
  } catch (error) {
    console.error("İşlem başarısız:", error);
    res.status(500).json({ message: "İşlem başarısız.", error: error.message });
  }
});

module.exports = router;
