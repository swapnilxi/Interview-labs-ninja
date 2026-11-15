import { settingsSections } from '@/modules/labs/common/LabSettings';
import { CV_DEFAULT_GUIDANCE } from './sectionGuidance';
import { buildCvPrerequisitesMarkdown } from './prerequisites';
import type { CVTopic } from './types';

export function getContent(sectionId: string, topic: CVTopic): string {
  const name = topic.name;

  const templates: Record<string, string> = {
    prerequisites: buildCvPrerequisitesMarkdown(topic),

    theory: `**Core Theory: ${name}**\n\n**Mathematical Foundation:**\nThe key operations in ${name} involve representing visual signals as multi-dimensional matrices and computing spatial or semantic features.\n\n- Grayscale representation: f(x, y) ∈ [0, 255]\n- Color representation: f(x, y) ∈ [0, 255]³ (e.g. RGB, HSV, LAB channels)\n- Convolutions compute local linear combinations: g(x, y) = ∑_dx ∑_dy f(x + dx, y + dy) · K(dx, dy)\n\n**Key principles and concepts:**\n- Locality — pixels close to each other are highly correlated.\n- Stationary statistics — visual features (like edges, textures) are invariant to translation.\n- Scale-space representation — structures exist across multiple resolutions.`,

    visual: `**Visual Explanation & Architecture Flow**\n\nData flow and structure through ${name}:\n\nInput Tensor [H × W × C]\n    ↓  Pre-processing & Normalization\nNormalized Tensor\n    ↓  Feature Extraction / Classical Operations\nIntermediate Map\n    ↓  Analysis / Matching / Inference Pipeline\nOutput Predictions / Processed Image\n\n**Key architectural elements:**\n- Receptive Field size: determines the global context captured by each visual node.\n- Feature Maps: channels corresponding to specific filters or color distributions.\n- Linear layers or post-processing (NMS, thresholding) to compute final predictions.`,

    implementation: `**Practical Implementation**\n\n\`\`\`python\nimport numpy as np\nimport cv2\n\n# ── Basic Image Reading & Processing ──────────────────────────────────\ndef process_visual_feed(image_path):\n    # Load in BGR color space\n    img = cv2.imread(image_path)\n    if img is None:\n        raise FileNotFoundError(f"Could not load image at {image_path}")\n        \n    # Convert color space for analysis\n    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\n    img_hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)\n    \n    # Normalize values for training / calculations\n    normalized = img_gray.astype(np.float32) / 255.0\n    return normalized\n\nprint("Computer Vision pipeline initialized successfully.")\n\`\`\``,

    hyperparameters: `**Hyperparameters & Design Choices**\n\n**Resolution Scales:**\n- Standard input size: 224x224 (good speed-accuracy tradeoff)\n- High-resolution: 512x512 or 1024x1024 (required for detailed OCR or small defects)\n\n**Kernel Sizes:**\n- 3x3 or 5x5: local feature extraction\n- 7x7 or 11x11: large receptive field (useful for early stage classical filters or input layers)\n\n**Threshold values:**\n- Binarization: global static threshold (e.g. 127) vs Otsu's automatic bimodal calculation\n- Block size for adaptive thresholds: must be an odd number (e.g. 3, 5, 11) relative to detail scale`,

    pitfalls: `**Common Pitfalls & Debugging**\n\n**Color Space Confusion (BGR vs RGB):**\n- OpenCV reads images in BGR format by default. Displaying them in Matplotlib or passing them to PyTorch backbones directly will swap Red and Blue channels.\n- Fix: \`img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)\`\n\n**Normalisation issues:**\n- Feeding float images [0.0, 1.0] to functions expecting integer values [0, 255] can lead to saturated white outputs or mathematical overflows.\n\n**Coordinates handling:**\n- Remember that pixel arrays are represented as (Height, Width, Channels), while bounding box/point coordinates are typically passed as (X, Y) which corresponds to (Col, Row).`,

    applications: `**Real-World Applications of ${name}**\n\n- **Medical Diagnosis Systems:** Automated detection of anomalies in X-Ray and MRI images using custom segmentation lines.\n- **Quality Control in Smart Factories:** Rapid detection of surface scratches or structural components using high-speed camera sensors.\n- **Self-Driving Vehicles:** Real-time localization of lanes, pedestrians, and traffic signs under varying weather/light conditions.`,

    interview: `**Important Interview Questions — ${name}**\n\n**Conceptual:**\n1. What is the difference between HSV and RGB color spaces, and when would you use HSV?\n2. Explain how Otsu's thresholding dynamically determines the optimal split.\n3. What is the aperture size in edge detection and how does it affect noise sensitivity?\n\n**Coding:**\n4. Write a function in NumPy to rotate an image by 90 degrees clockwise without using cv2.\n5. Implement a simple 2D convolution kernel function over a 2D grayscale image.`,

    comparison: `**Comparison with Alternatives**\n\n| Method | Computational Cost | Input Dependency | Edge Robustness |\n|---|---|---|---|\n| Classical Filter | Very Low | None | Sensitive to noise |\n| Shallow CNN | Medium | Requires training labels | Robust to variations |\n| Large Foundation (SAM/ViT) | High | Zero-shot generalization | Extremely robust |`,

    paper: `**Research Context: ${name}**\n\nHistorically, computer vision evolved from manual feature engineering (edge kernels, SIFT descriptors, morphological filters) to automated hierarchical representation learning using deep neural networks.\n\n**Core papers of interest:**\n- Canny (1986) — A Computational Approach to Edge Detection\n- Viola-Jones (2001) — Robust Real-time Face Detection\n- Dosovitskiy et al. (2020) — An Image is Worth 16x16 Words (ViT)`,

    references: `**References & Resources**\n\n- OpenCV Documentation (docs.opencv.org)\n- Stanford CS231n: Deep Learning for Computer Vision\n- Richard Szeliski's textbook: "Computer Vision: Algorithms and Applications"\n- Albumentations Library documentation (albumentations.ai)`
  };

  return templates[sectionId] ?? `**${name} — ${sectionId}**\n\nProfessional-grade content for this section covering ${name} in depth. This material is formatted for interview preparation and production engineering contexts.`;
}

// Standing instructions for the Prerequisites section when it is rewritten with the pen (the plain
// Generate fills in the template from ./prerequisites.ts, which has the same groups).
const PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS topic, as short bullets under these bold headings, in this order:
**Python & library skills** - concrete NumPy / OpenCV / PyTorch skills the topic uses (for example matrix multiplication with \`@\`, tensor shapes and permute, updating a dict of results after converting arrays to lists, hashmap lookups).
**Math & tensor operations** - the maths the topic leans on (for example matrix multiplication, homogeneous coordinates, gradients, softmax).
**Core concepts** - vision and deep-learning ideas to know first (for example intrinsic vs extrinsic camera parameters, convolution, IoU), and the earlier topics in this lab it builds on.

Every bullet names ONE concrete skill, never a vague area like "basic Python" or "linear algebra". Put a tiny example in backticks where it helps. Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const SECTION_DEFS = [
  { id: 'prerequisites', label: 'Prerequisites', icon: 'AcademicCapIcon', subtitle: 'Specific Python, math and vision skills to have first', guidance: PREREQUISITES_GUIDANCE },
  { id: 'theory', label: 'Core Theory', icon: 'CalculatorIcon', subtitle: 'Mathematical foundations + equations' },
  { id: 'visual', label: 'Visual Explanation & Architecture', icon: 'PhotoIcon', subtitle: 'Data flow diagrams + architecture' },
  { id: 'implementation', label: 'Practical Implementation', icon: 'CodeBracketIcon', subtitle: 'OpenCV / PyTorch code examples' },
  { id: 'hyperparameters', label: 'Hyperparameters & Design Choices', icon: 'AdjustmentsHorizontalIcon', subtitle: 'What to tune, typical values, tradeoffs' },
  { id: 'pitfalls', label: 'Common Pitfalls & Debugging', icon: 'BugAntIcon', subtitle: 'What goes wrong and how to fix it' },
  { id: 'applications', label: 'Real-World Applications', icon: 'BuildingOffice2Icon', subtitle: 'Industry use cases + company examples' },
  { id: 'interview', label: 'Important Interview Questions', icon: 'ChatBubbleLeftRightIcon', subtitle: 'Conceptual + coding + detailed answers' },
  { id: 'comparison', label: 'Comparison with Alternatives', icon: 'ScaleIcon', subtitle: 'Tradeoff table + when to use each' },
  { id: 'paper', label: 'Paper & Research Context', icon: 'DocumentMagnifyingGlassIcon', subtitle: 'Original paper + SOTA evolution' },
  { id: 'quiz', label: 'Quiz', icon: 'TrophyIcon', subtitle: '4 questions, score tracked, generate more' },
  { id: 'references', label: 'References & Resources', icon: 'BookOpenIcon', subtitle: 'CS231n, Papers With Code, OpenCV docs' },
];

// The sections the lab settings dialog lists (the quiz here is a fixed question bank, so it is left out).
export const SETTINGS_SECTIONS = settingsSections(SECTION_DEFS, CV_DEFAULT_GUIDANCE, { skip: ['quiz'] });
