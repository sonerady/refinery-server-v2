// getRequests.js
const express = require("express");
const supabase = require("../supabaseClient"); // Adjust the path if necessary

const router = express.Router();

router.get("/getRequests", async (req, res) => {
  // Extract user_id from query parameters
  const { user_id } = req.query;

  // Validate user_id
  if (!user_id) {
    return res
      .status(400)
      .json({ success: false, message: "user_id is required." });
  }

  // Optional: Validate if user_id is a valid UUID (assuming UUIDs are used)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(user_id)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid user_id format." });
  }

  try {
    // Calculate the timestamp for 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Delete records with status 'succeeded' older than 5 minutes
    const { error: deleteError } = await supabase
      .from("requests")
      .delete()
      .eq("status", "succeeded")
      .lt("created_at", fiveMinutesAgo);

    if (deleteError) {
      console.error(
        "Error deleting old succeeded requests:",
        deleteError.message
      );
      // Optionally, you can decide to return a 500 error here
      // return res.status(500).json({
      //   success: false,
      //   message: "Failed to delete old succeeded requests.",
      //   error: deleteError.message,
      // });
      // Or proceed without blocking the request
    }

    // Fetch requests from Supabase
    const { data, error, status } = await supabase
      .from("requests")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false }); // Optional: Order by latest

    if (error && status !== 406) {
      throw error;
    }

    // If no records found, return success with empty array
    if (!data) {
      return res.status(200).json({
        success: true,
        message: "No requests found for this user.",
        data: [],
      });
    }

    // Respond with the retrieved data and success flag
    return res.status(200).json({
      success: true,
      message: "Requests retrieved successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error fetching requests:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error.",
      error: error.message,
    });
  }
});

module.exports = router;
