const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/:training_id", async (req, res) => {
  const { training_id } = req.params;
  const apiToken = process.env.REPLICATE_API_TOKEN;

  try {
    const response = await axios.get(
      `https://api.replicate.com/v1/trainings/${training_id}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    const { status, logs } = response.data;

    // Yüzdelik değerini ayıklamak için fonksiyon
    function extractProgressPercentage(logs, status) {
      if (status === "succeeded") {
        return 100; // Eğer durum "succeeded" ise yüzde 100 döndür
      }

      const lines = logs.split("\n").reverse(); // Logları ters çevir
      for (const line of lines) {
        const match = line.match(/flux_train_replicate:\s*(\d+)%/); // Yüzdeyi yakala
        if (match) {
          return parseInt(match[1], 10); // Yüzdeyi döndür
        }
      }
      return 0; // Bulunamazsa 0 döndür
    }

    const progress_percentage = extractProgressPercentage(logs, status); // Yüzdeyi ayıkla

    // Geri dönülecek veriyi güncelle
    res.status(200).json({ ...response.data, progress: progress_percentage }); // Tam yanıtı dön
    console.log(progress_percentage);
  } catch (error) {
    console.error("Error fetching training data:", error.message);
    res.status(500).json({ message: "Training data could not be fetched." });
  }
});

module.exports = router;
