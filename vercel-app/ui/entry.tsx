import React from "react";
import { createRoot } from "react-dom/client";
import { ShimmerButton } from "./shimmer-button";
const target = document.getElementById("add-button-root");
if (target) createRoot(target).render(<ShimmerButton type="submit" className="wide magic-add" background="#246e60" borderRadius="10px" shimmerColor="#a9ead4">Add to fridge</ShimmerButton>);
