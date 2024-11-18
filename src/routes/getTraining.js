const express = require("express");
const axios = require("axios");
const supabase = require("../supabaseClient"); // Supabase client
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

    if (response.status !== 200) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const { status, logs, output } = response.data;

    function extractProgressPercentage(logs, status) {
      if (status === "succeeded") {
        return 100;
      }

      const lines = logs.split("\n").reverse();
      for (const line of lines) {
        const match = line.match(/flux_train_replicate:\s*(\d+)%/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
      return 0;
    }

    const progress_percentage = extractProgressPercentage(logs, status);

    const { data: productData, error: fetchError } = await supabase
      .from("userproduct")
      .select("*")
      .eq("product_id", training_id);

    if (fetchError) {
      console.error("Error fetching product data:", fetchError);
    } else if (productData.length === 0) {
      console.log(`No product found with ID: ${training_id}`);
    }

    // Status güncelleme işlemi
    if (status === "succeeded" && output && output.weights) {
      const userId = productData[0].user_id;

      if (!productData[0].isPaid) {
        const { data: userData, error: userFetchError } = await supabase
          .from("users")
          .select("credit_balance")
          .eq("id", userId)
          .single();

        if (userFetchError) {
          console.error("Error fetching user data:", userFetchError);
        } else if (userData && userData.credit_balance >= 100) {
          const newBalance = userData.credit_balance - 100;

          const { error: updateUserError } = await supabase
            .from("users")
            .update({ credit_balance: newBalance })
            .eq("id", userId);

          if (updateUserError) {
            throw new Error(
              `Error updating user credit balance: ${updateUserError.message}`
            );
          }

          const { error } = await supabase
            .from("userproduct")
            .update({ isPaid: true })
            .eq("product_id", training_id);

          if (error) {
            throw new Error(`Supabase error: ${error.message}`);
          }
        } else {
          console.log("User has insufficient credit balance or not found.");
        }
      }

      const { error } = await supabase
        .from("userproduct")
        .update({
          weights: output.weights,
          isPaid: true,
          status: "succeeded",
        })
        .eq("product_id", training_id);

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
    } else if (status === "canceled" || status === "failed") {
      if (productData[0].isPaid) {
        const userId = productData[0].user_id;

        const { data: userData, error: userFetchError } = await supabase
          .from("users")
          .select("credit_balance")
          .eq("id", userId)
          .single();

        // if (userFetchError) {
        //   console.error("Error fetching user data:", userFetchError);
        // } else if (userData) {
        //   const newBalance = userData.credit_balance + 100;

        //   const { error: updateUserError } = await supabase
        //     .from("users")
        //     .update({ credit_balance: newBalance })
        //     .eq("id", userId);

        //   if (updateUserError) {
        //     throw new Error(
        //       `Error updating user credit balance: ${updateUserError.message}`
        //     );
        //   }

        //   const { error } = await supabase
        //     .from("userproduct")
        //     .update({ isPaid: false, status })
        //     .eq("product_id", training_id);

        //   if (error) {
        //     throw new Error(`Supabase error: ${error.message}`);
        //   }
        // }
      } else {
        const { error } = await supabase
          .from("userproduct")
          .update({ status })
          .eq("product_id", training_id);

        if (error) {
          throw new Error(`Supabase error: ${error.message}`);
        }
      }
    }

    res.status(200).json({ ...response.data, progress: progress_percentage });
  } catch (error) {
    console.error("Error fetching training data:", error.message);
    // FE'ye boş data gönder
    res.status(200).json({
      status: "failed",
      logs: "",
      output: {},
      progress: 0,
    });
  }
});

module.exports = router;
