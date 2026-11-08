import React from "react";
import { createRoot } from "react-dom/client";
import { Beelden } from "../../src/beelden";

const beeld = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3C/svg%3E";
const urls = [beeld, `${beeld}%20`];
createRoot(document.getElementById("root")!).render(<><button>Voor</button><Beelden urls={(window as any).__meerBeelden ? urls : urls.slice(0, 1)} eager /><button>Na</button></>);
