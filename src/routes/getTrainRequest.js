// getTrainRequest.js
const express = require("express");
const supabase = require("../supabaseClient"); // Adjust the path if necessary

const router = express.Router();

router.get("/getTrainRequest", async (req, res) => {
  // Extract user_id from query parameters
  const { user_id } = req.query;

  // Validate user_id
  if (!user_id) {
    return res.status(400).json({ message: "user_id is required." });
  }

  // Optional: Validate if user_id is a valid UUID (assuming UUIDs are used)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(user_id)) {
    return res.status(400).json({ message: "Invalid user_id format." });
  }

  try {
    // Fetch generate_requests from Supabase
    const { data, error, status } = await supabase
      .from("generate_requests")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false }); // Optional: Order by latest

    if (error && status !== 406) {
      throw error;
    }

    // If no records found
    if (!data || data.length === 0) {
      return res
        .status(404)
        .json({ message: "No generate requests found for this user." });
    }

    // Respond with the retrieved data
    return res.status(200).json({
      message: "Generate requests retrieved successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error fetching generate_requests:", error.message);
    return res
      .status(500)
      .json({ message: "Internal Server Error.", error: error.message });
  }
});

module.exports = router;