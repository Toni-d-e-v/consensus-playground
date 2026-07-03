import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./Home";
import { Ex1Time } from "../exhibits/ex1-time/Ex1Time";

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ex1-time" element={<Ex1Time />} />
      </Routes>
    </BrowserRouter>
  );
}
