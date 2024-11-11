const express = require("express");
const supabase = require("../supabaseClient"); // Supabase client
const Replicate = require("replicate");
const multer = require("multer"); // Dosya yüklemek için kullanılıyor
const { v4: uuidv4 } = require("uuid");
const archiver = require("archiver"); // Zip dosyası oluşturmak için
const fs = require("fs"); // Dosya sistemine erişim için
const os = require("os"); // Geçici dizin için os modülü
const axios = require("axios"); // API istekleri için axios
const sharp = require("sharp"); // Sharp modülü

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
    const imageBuffers = [];

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
      imageBuffers.push(file.buffer);
    }

    // 3. Adım: Sharp ile dört resmi yan yana birleştirme
    if (imageBuffers.length < 4) {
      return res.status(400).json({ message: "En az 4 resim gerekli." });
    }

    // İlk 4 resmi yan yana birleştir
    const combinedImageBuffer = await sharp({
      create: {
        width: 800, // Örneğin: Her resim 200 px genişlikte, toplam 800 px
        height: 200, // Yükseklik 200 px
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: imageBuffers[0], left: 0, top: 0 },
        { input: imageBuffers[1], left: 200, top: 0 },
        { input: imageBuffers[2], left: 400, top: 0 },
        { input: imageBuffers[3], left: 600, top: 0 },
      ])
      .toBuffer();

    // Birleşik resmi Supabase'e yükle
    const combinedFileName = `combined_${Date.now()}.png`;
    const { data: combinedData, error: combinedError } = await supabase.storage
      .from("images")
      .upload(combinedFileName, combinedImageBuffer, {
        contentType: "image/png",
      });

    if (combinedError) {
      throw combinedError;
    }

    const { data: combinedUrlData, error: combinedUrlError } =
      await supabase.storage.from("images").getPublicUrl(combinedFileName);

    if (combinedUrlError) {
      throw combinedUrlError;
    }

    // 4. Adım: Eğitim işlemini başlat
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
          input_images: combinedUrlData.publicUrl, // Birleşik resmin URL'si
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
        image_urls: JSON.stringify([combinedUrlData.publicUrl]),
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
      combinedUrl: combinedUrlData.publicUrl,
    });
  } catch (error) {
    console.error("İşlem başarısız:", error);
    res.status(500).json({ message: "İşlem başarısız.", error: error.message });
  }
});

module.exports = router;
