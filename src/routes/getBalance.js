const express = require("express");
const axios = require("axios");
const supabase = require("../supabaseClient"); // Supabase client'ı import ediyoruz

const router = express.Router();

// Kullanıcı kredi bakiyesini getiren route
router.get("/getBalance/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  console.log("User ID:", user_id);

  try {
    // Kullanıcının ürünlerini alıyoruz
    const { data: userProducts, error: userProductError } = await supabase
      .from("userproduct")
      .select("*")
      .eq("user_id", user_id);

    if (userProductError) {
      console.error(
        "Kullanıcı ürünleri alınırken hata oluştu:",
        userProductError
      );
      return res.status(500).json({
        message: "Kullanıcı ürünleri alınırken bir hata oluştu.",
        error: userProductError.message,
      });
    }

    if (userProducts.length === 0) {
      return res.status(404).json({
        message: "Bu kullanıcıya ait ürün bulunamadı.",
      });
    }

    let trainingStatus = "failed"; // Başlangıçta eğitim durumu başarısız
    let output = {}; // Eğitim çıktısı

    // Her bir ürünün product_id'si ile getTraining API'sine istek atıyoruz
    for (const product of userProducts) {
      const { product_id } = product;

      // getTraining API'sine istek atıyoruz
      const response = await axios.get(
        `http://localhost:5000/training/${product_id}`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        }
      );

      if (response.status !== 200) {
        console.error(
          `getTraining API response error for product_id ${product_id}`
        );
        continue; // Eğer bir ürünün eğitim verisi alınamadıysa, diğerine geçiyoruz
      }

      const { status, output: trainingOutput } = response.data;

      // Eğitim başarıyla tamamlanmışsa
      if (status === "succeeded" && trainingOutput && trainingOutput.weights) {
        trainingStatus = status;
        output = trainingOutput;

        // Kullanıcının kredi bakiyesini alıyoruz
        const { data: userData, error: userFetchError } = await supabase
          .from("users")
          .select("credit_balance")
          .eq("id", user_id)
          .single();

        if (userFetchError) {
          console.error(
            "Kullanıcı verisi alınırken hata oluştu:",
            userFetchError
          );
          return res.status(500).json({
            message: "Kullanıcı verisi alınırken bir hata oluştu.",
            error: userFetchError.message,
          });
        }

        if (!userData) {
          return res.status(404).json({
            message: "Kullanıcı bulunamadı.",
          });
        }

        const creditBalance = userData.credit_balance;

        // Eğitim başarılı olduysa ve yeterli bakiye varsa, bakiyeyi güncelliyoruz
        if (creditBalance >= 100) {
          const newBalance = creditBalance - 100;

          const { error: updateUserError } = await supabase
            .from("users")
            .update({ credit_balance: newBalance })
            .eq("id", user_id);

          if (updateUserError) {
            console.error(
              "Kullanıcı bakiyesi güncellenirken hata oluştu:",
              updateUserError
            );
            return res.status(500).json({
              message: "Kullanıcı bakiyesi güncellenemedi.",
              error: updateUserError.message,
            });
          }
        } else {
          return res.status(400).json({
            message: "Yetersiz bakiye.",
          });
        }
      }
    }

    // Sonuçları döndürüyoruz
    res.status(200).json({
      creditBalance: output ? output.weights : 0, // Eğer output varsa, onun weights verisini döndürüyoruz
      trainingStatus,
      output,
    });
  } catch (error) {
    console.error(
      "Error fetching user products or training data:",
      error.message
    );
    res.status(500).json({
      message:
        "Kullanıcı ürünleri veya eğitim verisi alınırken bir hata oluştu.",
      error: error.message,
    });
  }
});

module.exports = router;
