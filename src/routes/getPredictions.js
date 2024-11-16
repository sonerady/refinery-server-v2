const express = require("express");
const supabase = require("../supabaseClient");

const router = express.Router();

router.get("/getPredictions/:userId", async (req, res) => {
  const { userId } = req.params;
  const { limit = 10, offset = 0 } = req.query; // Varsayılan olarak limit 10, offset 0

  try {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    // Veritabanında tahmin kayıtlarını paginasyon ile getir
    const { data: predictions, error: fetchError } = await supabase
      .from("predictions")
      .select(
        "id, prediction_image, categories, product_id, product_main_image, created_at"
      )
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString())
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1); // limit ve offset'i kullan

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      res.status(500).json({
        success: false,
        message: "Failed to fetch predictions",
      });
      return;
    }

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
