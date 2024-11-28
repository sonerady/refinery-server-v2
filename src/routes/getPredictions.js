const express = require("express");
const supabase = require("../supabaseClient");

const router = express.Router();

router.get("/getPredictions/:userId", async (req, res) => {
  const { userId } = req.params;

  // Parse the 'limit' query parameter if it exists
  const limitParam = req.query.limit;
  let limit = null;

  console.log("Received limit parameter:", limitParam);

  if (limitParam !== undefined) {
    limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid 'limit' parameter. It must be a positive integer.",
      });
    }

    // Optional: Enforce a maximum limit to prevent excessive data retrieval
    const MAX_LIMIT = 100;
    if (limit > MAX_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `The 'limit' parameter cannot exceed ${MAX_LIMIT}.`,
      });
    }
  }

  try {
    // Calculate the timestamp for one hour ago
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // Delete predictions older than one hour for the user
    const { error: deleteError } = await supabase
      .from("predictions")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", oneHourAgo.toISOString());

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return res.status(500).json({
        success: false,
        message: "Failed to delete old predictions",
      });
    }

    // Calculate the timestamp for one day ago
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    // Build the Supabase query with optional limit
    let query = supabase
      .from("predictions")
      .select(
        "id, prediction_image, categories, product_id, product_main_image, created_at"
      )
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString())
      .order("created_at", { ascending: false });

    if (limit !== null) {
      console.log(`Applying limit: ${limit}`);
      query = query.limit(limit);
    }

    // Execute the query
    const { data: predictions, error: fetchError } = await query;

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch predictions",
      });
    }

    console.log(`Fetched ${predictions.length} predictions`);

    // Respond with the fetched predictions
    return res.status(200).json({
      success: true,
      data: predictions,
    });
  } catch (error) {
    console.error("Error fetching predictions:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching predictions",
    });
  }
});

module.exports = router;
