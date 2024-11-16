const express = require("express");
const supabase = require("../supabaseClient");

const router = express.Router();

router.get("/getPredictions/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Şu anki tarih ve 1 saat öncesinin tarihini hesaplayın
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // 1 saatten eski olan prediction kayıtlarını sil
    const { error: deleteError } = await supabase
      .from("predictions")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", oneHourAgo.toISOString()); // created_at değeri 1 saatten eski olanları sil

    if (deleteError) {
      console.error("Delete error:", deleteError);
      res.status(500).json({
        success: false,
        message: "Failed to delete old predictions",
      });
      return;
    }

    // Şu anki tarih ve 1 gün öncesinin tarihini hesaplayın
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    // Veritabanında `user_id` ile eşleşen, `created_at` değeri 1 günden eski olmayan tüm tahmin kayıtlarını getir ve sıralamayı en yeniye göre yap
    const { data: predictions, error: fetchError } = await supabase
      .from("predictions")
      .select(
        "id, prediction_image, categories, product_id, product_main_image, created_at"
      )
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString()) // created_at değeri 1 gün önce veya daha yeni olan kayıtları alın
      .order("created_at", { ascending: false }); // En yeni verileri en üstte sıralayın

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      res.status(500).json({
        success: false,
        message: "Failed to fetch predictions",
      });
      return;
    }

    // Başarılı yanıt döndür
    res.status(200).json({
      success: true,
      data: predictions,
    });
  } catch (error) {
    console.error("Error fetching predictions:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching predictions",
    });
  }
});

module.exports = router;
