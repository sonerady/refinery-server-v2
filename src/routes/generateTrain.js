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

// Dosya upload, remove-bg, zip oluşturma ve eğitim işlemi
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

    // 2. Adım: URL'ler ile arka plan kaldırma işlemi (Replicate API kullanarak)
    for (const url of publicUrls) {
      try {
        // Replicate API ile arka planı kaldırıyoruz
        const output = await replicate.run(
          "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
          {
            input: {
              image: url,
            },
          }
        );

        // Sonuçları array'e ekliyoruz
        removeBgResults.push(output);
        console.log("Arka planı kaldırılan resim:", output);
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

      // 5. Adım: Replicate API ile eğitim başlatma
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

      // Replicate'den gelen `id`'yi hemen tabloya kaydediyoruz
      const replicateId = training.id;

      // İlk olarak `product_id` ve diğer bilgileri tabloya kaydet
      const { data: insertData, error: insertError } = await supabase
        .from("userproduct")
        .insert({
          user_id,
          product_id: replicateId, // Replicate'den gelen id'yi product_id olarak ekliyoruz
          status: "pending", // İlk başta 'pending' olarak ayarlıyoruz
          image_urls: JSON.stringify(publicUrls), // Resim URL'lerini JSONB olarak ekliyoruz
        });

      if (insertError) {
        throw insertError;
      }

      // Eğitim tamamlandığında tabloyu güncellemek için eğitim işlemini bekle
      if (training.status === "succeeded") {
        const replicateStatus = training.status;
        const replicateWeights = training.output.weights;

        // Eğitim tamamlandığında status ve weights'i güncelle
        const { data: updateData, error: updateError } = await supabase
          .from("userproduct")
          .update({
            status: replicateStatus, // Eğitim başarılı olduğunda status'ü güncelliyoruz
            weights: replicateWeights, // Eğitim tamamlandığında gelen weights değerini güncelliyoruz
          })
          .eq("product_id", replicateId);

        if (updateError) {
          throw updateError;
        }
      }

      // Eğitim sonucu ve diğer bilgileri döndürüyoruz
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
    for (const result of removeBgResults) {
      // Eğer result doğrudan URL ise:
      const imageUrl = result; // result'ı direkt URL olarak kullanıyoruz
      console.log("Resim URL'si:", imageUrl); // URL'yi logluyoruz

      if (imageUrl) {
        try {
          // Resmi axios ile indiriyoruz
          const response = await axios.get(imageUrl, {
            responseType: "arraybuffer", // Resmi binary veri olarak indirmek için
          });

          // İndirilen resmin boyutunu logluyoruz
          console.log("İndirilen resmin boyutu:", response.data.length);

          // Zip'e ekliyoruz
          archive.append(response.data, { name: `${uuidv4()}.png` });
        } catch (err) {
          console.error(`Resim indirme hatası: ${imageUrl}`, err);
        }
      } else {
        console.error("Geçersiz resim URL'si:", result);
      }
    }

    // Zip dosyasını finalize etme
    archive.finalize();
  } catch (error) {
    console.error("İşlem başarısız:", error);
    res.status(500).json({ message: "İşlem başarısız.", error: error.message });
  }
});

module.exports = router;
