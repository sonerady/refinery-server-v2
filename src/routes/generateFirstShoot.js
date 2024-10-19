const express = require("express");
const Replicate = require("replicate");
const { v4: uuidv4 } = require("uuid"); // UUID paketini ekliyoruz

const router = express.Router();

// Replicate API token'ını çevre değişkenlerinden alıyoruz
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

router.post("/", async (req, res) => {
  try {
    console.log(req.body);

    let { trigger_word, input_images, category } = req.body; // repoName'i buradan kaldırdık

    if (!trigger_word || !input_images) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // UUID oluşturuyoruz
    let repoName = uuidv4();

    // repoName'i formatlıyoruz
    repoName = repoName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_.]/g, "")
      .replace(/^-+|-+$/g, "");

    const model = await replicate.models.create("sonerady", repoName, {
      visibility: "public",
      hardware: "gpu-a40-large",
    });

    // Replicate API ile eğitim başlatıyoruz
    const training = await replicate.trainings.create(
      "ostris",
      "flux-dev-lora-trainer",
      "6f1e7ae9f285cfae6e12f8c18618418cfefe24b07172a17ff10a64fb23a6b772",
      {
        destination: `sonerady/${repoName}`,
        input: {
          steps: 1000,
          lora_rank: category === "jewelry" ? 32 : 16,
          optimizer: "adamw8bit",
          batch_size: 1,
          resolution: "512,768,1024",
          autocaption: true,
          input_images: input_images,
          trigger_word: trigger_word,
          learning_rate: 0.0004,
        },
      }
    );

    res.json({ message: "Training initiated successfully", training });
  } catch (error) {
    console.error("Error initiating training:", error);
    res.status(500).json({ error: "Failed to initiate training" });
  }
});

module.exports = router;
