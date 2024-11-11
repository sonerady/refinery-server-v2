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

// Endpoint tanımı
router.post("/generateTrain", upload.array("files", 10), async (req, res) => {
  const files = req.files;
  const { user_id } = req.body;

  // Dosya kontrolü
  if (!files || files.length === 0) {
    return res.status(400).json({ message: "Dosya gerekli." });
  }

  try {
    // 1. Adım: Kullanıcının kredi bakiyesini kontrol et
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("credit_balance")
      .eq("id", user_id)
      .single();

    if (userError) {
      throw userError;
    }

    // Kredi bakiyesi yeterli mi kontrol et
    if (userData.credit_balance < 100) {
      return res.status(400).json({ message: "Yetersiz kredi." });
    }

    const signedUrls = [];
    const removeBgResults = [];

    // 2. Adım: Dosyaları Supabase'e yükleme ve genel URL alma
    for (const file of files) {
      const fileName = `${Date.now()}_${file.originalname}`;

      const { data, error } = await supabase.storage
        .from("images")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
        });

      if (error) {
        throw error;
      }

      // Dosyanın süresiz olarak erişilebilir URL'sini oluşturun
      const { data: publicUrlData, error: publicUrlError } =
        await supabase.storage.from("images").getPublicUrl(fileName);

      if (publicUrlError) {
        throw publicUrlError;
      }

      signedUrls.push(publicUrlData.publicUrl);
    }

    // 3. Adım: signed URL'lerle arka plan kaldırma işlemi (Photoroom API kullanarak)
    for (const url of signedUrls) {
      try {
        const response = await axios.get(
          `https://image-api.photoroom.com/v2/edit?background.color=white&background.scaling=fill&outputSize=2000x2000&padding=0.1&imageUrl=${url}`,
          {
            headers: {
              "x-api-key": process.env.PHOTO_ROOM_API_KEY,
            },
            responseType: "arraybuffer",
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

    // Zip dosyası kapatıldığında işlemleri tamamla
    output.on("close", async () => {
      console.log(`${archive.pointer()} byte'lık zip dosyası oluşturuldu.`);

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

      const model = await replicate.models.create("skozaa5", repoName, {
        visibility: "public",
        hardware: "gpu-a40-large",
      });

      const training = await replicate.trainings.create(
        "ostris",
        "flux-dev-lora-trainer",
        "e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497",
        {
          destination: `skozaa5/${repoName}`,
          input: {
            steps: 1000,
            lora_rank: 20,
            optimizer: "adamw8bit",
            batch_size: 1,
            resolution: "512,768,1024",
            autocaption: true,
            input_images: zipUrlData.publicUrl, // Zip dosyasının URL'si
            trigger_word: "TOK",
            learning_rate: 0.0004,
            autocaption_prefix: "a photo of TOK",
          },
        }
      );

      const replicateId = training.id;

      // Veritabanına kaydet
      const { data: insertData, error: insertError } = await supabase
        .from("userproduct")
        .insert({
          user_id,
          product_id: replicateId,
          status: "pending",
          image_urls: JSON.stringify([signedUrls[0]]),
          isPaid: true, // isPaid alanını true olarak ayarladık
        });

      if (insertError) {
        throw insertError;
      }

      // Eğer her şey başarılı olduysa, kredi bakiyesinden 100 düş
      const newCreditBalance = userData.credit_balance - 100;
      const { error: updateError } = await supabase
        .from("users")
        .update({ credit_balance: newCreditBalance })
        .eq("id", user_id);

      if (updateError) {
        throw updateError;
      }

      // Yanıtı döndür
      res.status(200).json({
        message: "Eğitim başlatıldı",
        training,
        signedUrls,
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
