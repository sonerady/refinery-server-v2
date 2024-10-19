const express = require("express");
const router = express.Router();
const axios = require("axios");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4, validate: uuidValidate } = require("uuid"); // validate fonksiyonunu ekledik

require("dotenv").config();

// Supabase bağlantısı (Anonim kullanıcılar için anon key kullanıyoruz)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // Anonim kullanıcılar için anahtar
const supabase = createClient(supabaseUrl, supabaseAnonKey);

router.get("/:training_id", async (req, res) => {
  const { training_id } = req.params;

  try {
    const response = await axios.get(
      `https://api.replicate.com/v1/trainings/${training_id}`,
      {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { id, status, started_at, created_at, logs, output, input } =
      response.data;

    function extractProgressPercentage(logs, status) {
      if (status === "succeeded") {
        return 100;
      }

      const lines = logs.split("\n").reverse();
      for (const line of lines) {
        const match = line.match(/flux_train_replicate:\s+(\d+)%\|/);
        if (match) {
          const percentage = parseInt(match[1], 10);
          return percentage;
        }
      }
      return 0; // Default to 0 if no percentage is found
    }

    const progress_percentage = extractProgressPercentage(logs, status);

    const weights = output ? output.weights : null;
    const version = output ? output.version : null;
    const trigger_word = input ? input.trigger_word : null;
    const input_images = input ? input.input_images : null;

    // FE'den gelen UUID'nin doğruluğunu kontrol et
    const frontendId = id; // FE tarafından gelen ID
    const isValidUUID = uuidValidate(frontendId);

    // Eğer FE'den geçerli bir UUID gelmemişse BE'de UUID oluştur
    const generatedId = isValidUUID ? frontendId : uuidv4();

    // Eğer input_images varsa işleme devam et
    if (input_images) {
      const zipUrl = input_images;
      const tempDir = path.resolve(__dirname, "temp");
      const zipPath = path.resolve(tempDir, "images.zip");
      const extractPath = path.resolve(tempDir, `extracted_${Date.now()}`);

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      try {
        const response = await axios({
          url: zipUrl,
          method: "GET",
          responseType: "arraybuffer",
        });

        fs.writeFileSync(zipPath, response.data);

        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);

        const files = fs.readdirSync(extractPath).filter((file) => {
          return (
            file.endsWith(".png") ||
            file.endsWith(".jpg") ||
            file.endsWith(".jpeg")
          );
        });

        const imageBase64s = files.slice(0, 3).map((file) => {
          const filePath = path.join(extractPath, file);
          const fileBuffer = fs.readFileSync(filePath);
          return `data:image/${path
            .extname(file)
            .slice(1)};base64,${fileBuffer.toString("base64")}`;
        });

        // Verileri Supabase'e kaydet
        const { data, error } = await supabase.from("trainings").insert([
          {
            id: generatedId, // UUID'yi burada kullanıyoruz
            status,
            created_at,
            progress_percentage,
            weights,
            version,
            trigger_word,
            input_images: input_images, // URL'yi saklıyoruz
            images: imageBase64s, // Base64 formatında saklıyoruz
          },
        ]);

        if (error) {
          console.error("Supabase'e veri kaydedilirken hata oluştu:", error);
          return res
            .status(500)
            .json({ error: "Veri kaydedilirken hata oluştu" });
        }

        res.status(200).json({ message: "Veri başarıyla kaydedildi", data });

        fs.unlinkSync(zipPath);
        files.forEach((file) => {
          fs.unlinkSync(path.join(extractPath, file));
        });
        fs.rmdirSync(extractPath);
      } catch (error) {
        console.error("Zip dosyası işlenirken hata oluştu:", error);
        res.status(500).json({ error: "Zip dosyası işlenirken hata oluştu" });
      }
    } else {
      // input_images yoksa Supabase'e kaydetme işlemi
      const { data, error } = await supabase.from("trainings").insert([
        {
          id: generatedId, // UUID'yi burada kullanıyoruz
          status,
          created_at,
          progress_percentage,
          weights,
          version,
          trigger_word,
          input_images: null,
          images: [],
        },
      ]);

      if (error) {
        console.error("Supabase'e veri kaydedilirken hata oluştu:", error);
        return res
          .status(500)
          .json({ error: "Veri kaydedilirken hata oluştu" });
      }

      res.status(200).json({ message: "Veri başarıyla kaydedildi", data });
    }
  } catch (error) {
    console.error("Failed to fetch training data:", error);
    res.status(500).json({ error: "Failed to fetch training data" });
  }
});

module.exports = router;
