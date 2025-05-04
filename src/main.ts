import { graphviz } from "d3-graphviz";
import dotString from "./example.dot?raw";

graphviz("#graph")
	.renderDot(dotString);