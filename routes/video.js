const express = require("express");
const router = express.Router();


router.get("/", async (req, res) => {
    try {
      res.render("index");
    } catch (e) {
      console.log(e);
      return res.status(500).json({
        status: "false",
        message: "Internal server error",
      });
    }
  });

 
  
  module.exports = router;
  