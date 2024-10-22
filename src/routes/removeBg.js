const express = require("express");
const Replicate = require("replicate");

const router = express.Router();

// Replicate API token'ını çevre değişkenlerinden alıyoruz
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Arka planı kaldıran route
router.post("/remove-bg", async (req, res) => {
  const { image_url } = req.body;

  if (!image_url) {
    return res.status(400).json({ message: "Resim URL'si gerekli." });
  }

  try {
    // Replicate API'sini kullanarak arka planı kaldırıyoruz
    const output = await replicate.run(
      "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
      {
        input: {
          image: image_url,
        },
      }
    );

    res.status(200).json({ output });
  } catch (error) {
    console.error("Arka plan kaldırma işlemi başarısız:", error);
    res
      .status(500)
      .json({ message: "Arka plan kaldırılamadı.", error: error.message });
  }
});

module.exports = router;
