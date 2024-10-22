const express = require("express");
const supabase = require("../supabaseClient"); // Supabase client'ı import ediyoruz

const router = express.Router();

// Kullanıcının ürünlerini getiren route
router.get("/userproduct/:id", async (req, res) => {
  const { id } = req.params;
  console.log("caca", id);

  try {
    // Belirtilen kullanıcıya ait ürünleri çekiyoruz
    const { data, error } = await supabase
      .from("userproduct")
      .select("*")
      .eq("user_id", id);

    console.log("dataaa", data);

    if (error) {
      console.error("Ürünler getirilirken hata oluştu:", error.message);
      return res
        .status(500)
        .json({ message: "Ürünler getirilemedi.", error: error.message });
    }

    if (!data.length) {
      return res
        .status(404)
        .json({ message: "Bu kullanıcıya ait ürün bulunamadı." });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Sunucu hatası:", err.message);
    res.status(500).json({ message: "Sunucu hatası." });
  }
});

module.exports = router;
