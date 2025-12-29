import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Standard import (safer than top-level await for now)
import alfa from "./routes/alfa.js"; 

const app = express();

// 1. Explicit CORS Configuration
app.use(cors({
  origin: ["https://www.ostravel.pk", "https://ostravel.pk", "http://localhost:5173"], // Add your frontend URLs here
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true // Allow cookies/headers if needed
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/alfa", alfa);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
