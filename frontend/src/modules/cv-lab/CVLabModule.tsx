'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import LabCopilot from '@/components/common/LabCopilot';
import OnDemandSection from '@/components/lab/OnDemandSection';
import QuizCarousel from '@/components/lab/QuizCarousel';
import GenerateQuestionsPanel from '@/modules/common/GenerateQuestionsPanel';

interface CVTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  prerequisites: string[];
  subtopics: { id: string; name: string; brief: string }[];
  isCustom?: boolean;
}

interface SectionState {
  generated: boolean;
  generating: boolean;
  content: string;
}

const TOPICS: CVTopic[] = [
  {
    id: "image-basics",
    name: "Image Basics & Representation",
    brief: "Learn pixels, channels, and basic operations with OpenCV.",
    category: "Fundamentals",
    difficulty: "Easy",
    prerequisites: ["Basic Python", "NumPy"],
    subtopics: [
      { id: "cv-pixels", name: "Pixels, Channels, Color Spaces (RGB, HSV, LAB)", brief: "Understanding how images are represented in memory." },
      { id: "cv-io", name: "Image Reading, Writing, Display with OpenCV", brief: "Loading, displaying, and saving images using cv2." },
      { id: "cv-transforms", name: "Image Resizing, Cropping, Rotation", brief: "Primary geometric manipulation operations." }
    ]
  },
  {
    id: "filtering-convolution",
    name: "Image Filtering & Convolution",
    brief: "Understand spatial filtering and kernel-based image convolution.",
    category: "Classical CV",
    difficulty: "Easy",
    prerequisites: ["Image Basics", "2D Convolution Math"],
    subtopics: [
      { id: "cv-kernels", name: "Kernels & Convolution Operation", brief: "Mathematical concept of moving a kernel over an image." },
      { id: "cv-blurs", name: "Gaussian Blur & Box Blur", brief: "Image smoothing techniques and low-pass filtering." },
      { id: "cv-sharpen", name: "Sharpening Filters", brief: "Enhancing image high-frequency details." }
    ]
  },
  {
    id: "thresholding-binarization",
    name: "Thresholding & Binarization",
    brief: "Convert grayscale images to binary using global or local thresholding.",
    category: "Classical CV",
    difficulty: "Easy",
    prerequisites: ["Image Basics"],
    subtopics: [
      { id: "cv-otsu", name: "Global Thresholding (Otsu's Method)", brief: "Automatic thresholding based on bimodal histograms." },
      { id: "cv-adaptive-thresh", name: "Adaptive Thresholding", brief: "Local binarization under uneven lighting conditions." },
      { id: "cv-color-mask", name: "Color-based Segmentation (HSV masking)", brief: "Isolating colored objects in HSV color space." }
    ]
  },
  {
    id: "edge-detection",
    name: "Edge Detection",
    brief: "Detect spatial boundaries and high-contrast lines in images.",
    category: "Classical CV",
    difficulty: "Easy-Medium",
    prerequisites: ["Filtering & Convolution"],
    subtopics: [
      { id: "cv-gradients", name: "Sobel & Laplacian Operators", brief: "Calculating first and second order spatial derivatives." },
      { id: "cv-canny", name: "Canny Edge Detection", brief: "Multi-stage edge detector with hysteresis thresholding." },
      { id: "cv-edge-realworld", name: "Edge Detection for Real-World Images", brief: "Handling noise and scaling parameter adjustments." }
    ]
  },
  {
    id: "morphological",
    name: "Morphological Operations",
    brief: "Perform mathematical morphology on binary shapes.",
    category: "Classical CV",
    difficulty: "Easy",
    prerequisites: ["Thresholding & Binarization"],
    subtopics: [
      { id: "cv-erosion-dilation", name: "Erosion, Dilation", brief: "Shrinking or expanding binary shapes." },
      { id: "cv-open-close", name: "Opening, Closing", brief: "Opening and closing operations." },
      { id: "cv-morph-noise", name: "Morphological Noise Removal", brief: "Combining operators to isolate structures." }
    ]
  },
  {
    id: "contour-detection",
    name: "Contour Detection & Shape Analysis",
    brief: "Find, analyze, and classify geometric boundaries in binary images.",
    category: "Classical CV",
    difficulty: "Medium",
    prerequisites: ["Thresholding & Binarization", "Edge Detection"],
    subtopics: [
      { id: "cv-find-contours", name: "Finding & Drawing Contours", brief: "Extracting curves representing boundaries." },
      { id: "cv-contour-props", name: "Contour Properties (area, perimeter, bounding box)", brief: "Computing geometric indicators of a contour." },
      { id: "cv-shape-class", name: "Shape Classification using Contours", brief: "Sorting contours by circularity or aspect ratio." }
    ]
  },
  {
    id: "feature-detection",
    name: "Feature Detection & Matching",
    brief: "Detect robust keypoints and associate them across multiple viewpoints.",
    category: "Classical CV",
    difficulty: "Medium",
    prerequisites: ["Filtering & Convolution", "Linear Algebra"],
    subtopics: [
      { id: "cv-harris", name: "Harris Corner Detection", brief: "Detecting corners based on local intensity changes." },
      { id: "cv-orb", name: "ORB Feature Detector", brief: "Fast, scale-invariant binary feature keypoint descriptor." },
      { id: "cv-matcher", name: "Feature Matching between Images (BFMatcher)", brief: "Associating keypoint descriptions using Hamming distance." }
    ]
  },
  {
    id: "histogram-analysis",
    name: "Histogram Analysis",
    brief: "Analyze global color distribution and improve contrast.",
    category: "Classical CV",
    difficulty: "Easy-Medium",
    prerequisites: ["Image Basics"],
    subtopics: [
      { id: "cv-hist-compute", name: "Histogram Computation & Visualization", brief: "Counting pixel frequency per intensity value." },
      { id: "cv-clahe", name: "Histogram Equalization (CLAHE)", brief: "Contrast adjustment and adaptive equalization." },
      { id: "cv-backprojection", name: "Histogram Backprojection", brief: "Finding regions matching a model color template." }
    ]
  },
  {
    id: "geometric-homography",
    name: "Geometric Transformations & Homography",
    brief: "Project image viewpoints onto planes using linear maps.",
    category: "Classical CV",
    difficulty: "Medium",
    prerequisites: ["Linear Algebra"],
    subtopics: [
      { id: "cv-affine", name: "Affine Transformations", brief: "Scale, translation, rotation using 2x3 matrices." },
      { id: "cv-perspective", name: "Perspective Transform (Bird's Eye View)", brief: "Warping perspective using 3x3 matrices." },
      { id: "cv-ransac", name: "Homography Estimation with RANSAC", brief: "Calculating projection matrices under outlier noise." }
    ]
  },
  {
    id: "template-matching",
    name: "Template Matching & Object Localization",
    brief: "Search for matches to a smaller reference image within a scene.",
    category: "Classical CV",
    difficulty: "Medium",
    prerequisites: ["Filtering & Convolution"],
    subtopics: [
      { id: "cv-tm-methods", name: "Template Matching Methods", brief: "Comparing normalized cross-correlation and squared diffs." },
      { id: "cv-tm-multiscale", name: "Multi-scale Template Matching", brief: "Matching template over a range of resolution scales." },
      { id: "cv-tm-limits", name: "Limitations & When to Use", brief: "Sensitivity to scale, rotation, and illumination." }
    ]
  },
  {
    id: "optical-flow",
    name: "Optical Flow & Motion Estimation",
    brief: "Track pixel displacements across video frames.",
    category: "Classical CV",
    difficulty: "Medium-Hard",
    prerequisites: ["Filtering & Convolution", "Calculus"],
    subtopics: [
      { id: "cv-lucas-kanade", name: "Lucas-Kanade Optical Flow", brief: "Sparse feature tracking over consecutive frames." },
      { id: "cv-farneback", name: "Dense Optical Flow (Farneback)", brief: "Calculating displacement vectors for all pixels." },
      { id: "cv-motion-tracking", name: "Motion Detection & Tracking Applications", brief: "Background subtraction and trajectory tracking." }
    ]
  },
  {
    id: "image-segmentation-classical",
    name: "Image Segmentation (Classical)",
    brief: "Divide an image into semantic regions using classical algorithms.",
    category: "Classical CV",
    difficulty: "Medium",
    prerequisites: ["Contour Detection"],
    subtopics: [
      { id: "cv-watershed", name: "Watershed Algorithm", brief: "Marker-based image segmentation using topographies." },
      { id: "cv-grabcut", name: "GrabCut", brief: "Interactive foreground extraction using graph cuts." },
      { id: "cv-meanshift", name: "Mean Shift Segmentation", brief: "Clustering pixel colors to partition regions." }
    ]
  },
  {
    id: "camera-calibration-stereo",
    name: "Camera Calibration & Stereo Vision",
    brief: "Extract depth maps and spatial coordinates using multi-camera layouts.",
    category: "Geometry & Stereo",
    difficulty: "Hard",
    prerequisites: ["Linear Algebra", "Geometric Transformations & Homography"],
    subtopics: [
      { id: "cv-params", name: "Intrinsic & Extrinsic Parameters", brief: "Camera focal length, principal point, pose matrices." },
      { id: "cv-chessboard", name: "Chessboard Calibration", brief: "Estimating distortion coefficients via targets." },
      { id: "cv-depth-maps", name: "Stereo Matching & Depth Maps", brief: "Triangulating disparity values between stereo cameras." }
    ]
  },
  {
    id: "intro-cnn",
    name: "Introduction to CNNs",
    brief: "Understand the layers, math, and operations of convolutional nets.",
    category: "Deep Learning",
    difficulty: "Medium",
    prerequisites: ["Python & PyTorch", "Linear Algebra", "Calculus"],
    subtopics: [
      { id: "cv-layers", name: "Convolution, Pooling, Stride, Padding", brief: "Core components of convolutional neural layers." },
      { id: "cv-cnn-scratch", name: "Building a CNN from Scratch (PyTorch)", brief: "Assembling layers into a network model in PyTorch." },
      { id: "cv-cifar", name: "Training on CIFAR-10", brief: "Running a complete image classification training cycle." }
    ]
  },
  {
    id: "transfer-learning",
    name: "Transfer Learning & Fine-Tuning",
    brief: "Adapt large pretrained networks to target datasets.",
    category: "Deep Learning",
    difficulty: "Medium",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-pretrained", name: "Using Pretrained Models (ResNet, EfficientNet)", brief: "Loading model weights pre-trained on ImageNet." },
      { id: "cv-fe-vs-ft", name: "Feature Extraction vs Fine-Tuning", brief: "Freezing backbone weights vs full tuning." },
      { id: "cv-custom-pipeline", name: "Custom Dataset Training Pipeline", brief: "Custom PyTorch Dataset and DataLoader design." }
    ]
  },
  {
    id: "classification-architectures",
    name: "Image Classification Architectures",
    brief: "Trace SOTA backbone structures and design evolutions.",
    category: "Deep Learning",
    difficulty: "Medium-Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-archs-evolution", name: "LeNet -> AlexNet -> VGG (evolution)", brief: "Timeline of early CNN architectures." },
      { id: "cv-resnet", name: "ResNet & Skip Connections", brief: "Gradient flow optimization via residual blocks." },
      { id: "cv-efficientnet", name: "EfficientNet & Compound Scaling", brief: "Compound scaling of width, depth and resolution." }
    ]
  },
  {
    id: "yolo-object-detection",
    name: "Object Detection with YOLO",
    brief: "Train and deploy single-stage real-time object detectors.",
    category: "Deep Learning",
    difficulty: "Medium-Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-yolo-how", name: "YOLO Architecture & How It Works", brief: "Grid-based object detection strategy." },
      { id: "cv-yolo-train", name: "YOLOv8 Training on Custom Dataset", brief: "Preparing bounding box labels and running ultralytics." },
      { id: "cv-yolo-deploy", name: "Real-Time Detection Deployment", brief: "Exporting YOLO models to running scripts." }
    ]
  },
  {
    id: "two-stage-object-detection",
    name: "Object Detection (Two-Stage)",
    brief: "Understand region-proposal and anchor-based detector networks.",
    category: "Deep Learning",
    difficulty: "Hard",
    prerequisites: ["Introduction to CNNs", "Object Detection with YOLO"],
    subtopics: [
      { id: "cv-rcnn-evolution", name: "R-CNN -> Fast R-CNN -> Faster R-CNN", brief: "History of region proposal architectures." },
      { id: "cv-rpn", name: "Region Proposal Networks", brief: "Directing CNN model attention to candidates." },
      { id: "cv-det-metrics", name: "Anchor Boxes, IoU, NMS, mAP Metrics", brief: "Object detection evaluation criteria." }
    ]
  },
  {
    id: "semantic-segmentation",
    name: "Semantic Segmentation",
    brief: "Classify every pixel in an image to a semantic class.",
    category: "Deep Learning",
    difficulty: "Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-fcn", name: "Fully Convolutional Networks (FCN)", brief: "Replacing linear classifier layers with conv layers." },
      { id: "cv-unet", name: "U-Net Architecture & Medical Imaging", brief: "Symmetrical contracting and expanding paths." },
      { id: "cv-deeplab", name: "DeepLabV3+ & Atrous Convolution", brief: "Capturing context using dilated kernels." }
    ]
  },
  {
    id: "instance-segmentation",
    name: "Instance Segmentation",
    brief: "Identify, segment, and separate individual objects in scenes.",
    category: "Deep Learning",
    difficulty: "Hard",
    prerequisites: ["Object Detection (Two-Stage)", "Semantic Segmentation"],
    subtopics: [
      { id: "cv-mask-rcnn", name: "Mask R-CNN Architecture", brief: "Adding a mask projection head to Faster R-CNN." },
      { id: "cv-panoptic", name: "Panoptic Segmentation", brief: "Fusing background stuff and foreground things." },
      { id: "cv-sam", name: "Segment Anything Model (SAM)", brief: "Promptable visual foundation segmentation models." }
    ]
  },
  {
    id: "gans",
    name: "GANs (Generative Adversarial Networks)",
    brief: "Train adversarial generator and discriminator models.",
    category: "Generative AI",
    difficulty: "Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-gan-loop", name: "GAN Fundamentals & Training Loop", brief: "Minimax optimization of generator vs discriminator." },
      { id: "cv-dcgan", name: "DCGAN Implementation", brief: "Using transpose convolutions to synthesize images." },
      { id: "cv-cyclegan", name: "CycleGAN (Unpaired Image Translation)", brief: "Mapping styles across unaligned image sets." }
    ]
  },
  {
    id: "diffusion-models",
    name: "Diffusion Models",
    brief: "Generate high-fidelity images using denoising probability paths.",
    category: "Generative AI",
    difficulty: "Hard",
    prerequisites: ["Semantic Segmentation", "Probability & Calculus"],
    subtopics: [
      { id: "cv-ddpm", name: "DDPM (Denoising Diffusion Probabilistic Models)", brief: "Forward noise addition and backward denoising loops." },
      { id: "cv-stable-diff", name: "Stable Diffusion Architecture", brief: "Latent diffusion inside encoded vector spaces." },
      { id: "cv-controlnet", name: "Controlnet & Guided Generation", brief: "Injecting spatial conditions into U-Net paths." }
    ]
  },
  {
    id: "vit",
    name: "Vision Transformers (ViT)",
    brief: "Apply self-attention mechanisms directly to image patch sequences.",
    category: "Transformers & Attention",
    difficulty: "Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-vit-attn", name: "Self-Attention for Images", brief: "Computing query-key similarity matrices over patches." },
      { id: "cv-vit-patches", name: "ViT Architecture & Patch Embeddings", brief: "Flattening 16x16 pixels into token vectors." },
      { id: "cv-swin", name: "Swin Transformer & Hierarchical Features", brief: "Shifted window attention to reduce complexity." }
    ]
  },
  {
    id: "clip-multimodal",
    name: "CLIP & Multimodal Vision",
    brief: "Align text and image embeddings in shared contrastive spaces.",
    category: "Transformers & Attention",
    difficulty: "Hard",
    prerequisites: ["Vision Transformers (ViT)"],
    subtopics: [
      { id: "cv-clip-contrastive", name: "Contrastive Learning for Vision-Language", brief: "Aligning matched image-text pairs in a batch." },
      { id: "cv-clip-zeroshot", name: "Zero-Shot Classification with CLIP", brief: "Predicting image labels via dynamic text prompts." },
      { id: "cv-clip-search", name: "Building a CLIP-based Image Search", brief: "Searching visual databases using natural language." }
    ]
  },
  {
    id: "video-understanding",
    name: "Video Understanding",
    brief: "Analyze temporal transitions and track objects across frames.",
    category: "Deep Learning",
    difficulty: "Medium-Hard",
    prerequisites: ["Introduction to CNNs", "Optical Flow & Motion Estimation"],
    subtopics: [
      { id: "cv-video-io", name: "Frame Extraction & Video Processing", brief: "Handling video stream ingestion and encoding." },
      { id: "cv-tracking", name: "Object Tracking (DeepSORT, ByteTrack)", brief: "Kalman filters and embedding associations." },
      { id: "cv-action-rec", name: "Action Recognition (SlowFast, I3D)", brief: "Extracting features across spatial and temporal dimensions." }
    ]
  },
  {
    id: "face-detection-recognition",
    name: "Face Detection & Recognition",
    brief: "Detect human faces and associate them with identities.",
    category: "Deep Learning",
    difficulty: "Medium",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-classical-face", name: "Haar Cascades & HOG Detectors", brief: "Early face boundary detection heuristics." },
      { id: "cv-mtcnn", name: "MTCNN & RetinaFace", brief: "Cascade deep networks for boundary localization." },
      { id: "cv-facenet", name: "FaceNet Embeddings & Face Matching", brief: "Learning facial feature vectors using triplet loss." }
    ]
  },
  {
    id: "ocr-document-analysis",
    name: "OCR & Document Analysis",
    brief: "Segment layout boundaries and read character symbols in documents.",
    category: "Deep Learning",
    difficulty: "Medium",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-tesseract", name: "Tesseract OCR Pipeline", brief: "Text detection and character recognition pipeline." },
      { id: "cv-scene-text", name: "Scene Text Detection (EAST, CRAFT)", brief: "Finding dynamic text rotated in natural scenes." },
      { id: "cv-layout-analysis", name: "Document Layout Analysis", brief: "Parsing sections, tables, and paragraphs." }
    ]
  },
  {
    id: "pose-estimation",
    name: "Pose Estimation",
    brief: "Track human joint coordinates and body postures.",
    category: "Deep Learning",
    difficulty: "Medium-Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-mediapipe", name: "OpenPose & MediaPipe", brief: "Real-time keypoint extraction pipelines." },
      { id: "cv-hrnet", name: "HRNet Architecture", brief: "Preserving high-resolution features across network pipelines." },
      { id: "cv-pose-apps", name: "Applications: Fitness, AR, Sign Language", brief: "Interpreting joint coordinates for motion logic." }
    ]
  },
  {
    id: "3d-vision-depth",
    name: "3D Vision & Depth Estimation",
    brief: "Generate point clouds and estimate scene depth from 2D views.",
    category: "Geometry & Stereo",
    difficulty: "Hard",
    prerequisites: ["Camera Calibration & Stereo Vision"],
    subtopics: [
      { id: "cv-mono-depth", name: "Monocular Depth Estimation (MiDaS)", brief: "Predicting relative depth from a single camera frame." },
      { id: "cv-point-clouds", name: "Point Clouds & PointNet", brief: "Processing unordered collections of 3D spatial points." },
      { id: "cv-nerf", name: "NeRF (Neural Radiance Fields)", brief: "Synthesizing views using neural implicit representations." }
    ]
  },
  {
    id: "model-deployment-vision",
    name: "Model Deployment for Vision",
    brief: "Optimize and compile neural backbones for target runtimes.",
    category: "MLOps",
    difficulty: "Medium",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-onnx", name: "ONNX Export & Optimization", brief: "Translating PyTorch models to dynamic computation graphs." },
      { id: "cv-tensorrt", name: "TensorRT & OpenVINO", brief: "Compiling models for Nvidia or Intel silicon layers." },
      { id: "cv-edge-deploy", name: "Edge Deployment (Jetson Nano, Mobile)", brief: "Deploying models inside resource-constrained environments." }
    ]
  },
  {
    id: "data-augmentation-tricks",
    name: "Data Augmentation & Training Tricks",
    brief: "Increase dataset variety and optimize model robustness.",
    category: "Deep Learning",
    difficulty: "Easy-Medium",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-albumentations", name: "Albumentations Library", brief: "Creating fast, pixel-level bounding box augmentations." },
      { id: "cv-aug-mix", name: "Mixup, Cutout, CutMix", brief: "Creating synthetic linear combination images." },
      { id: "cv-class-imbalance", name: "Handling Class Imbalance", brief: "Focal Loss and weighted sample strategies." }
    ]
  },
  {
    id: "adversarial-robustness",
    name: "Adversarial Attacks & Robustness",
    brief: "Deconstruct models using adversarial perturbations and defend them.",
    category: "Deep Learning",
    difficulty: "Hard",
    prerequisites: ["Introduction to CNNs", "Calculus (gradients)"],
    subtopics: [
      { id: "cv-attacks", name: "FGSM & PGD Attacks", brief: "Synthesizing input perturbations along loss gradients." },
      { id: "cv-adv-training", name: "Adversarial Training", brief: "Injecting perturbed inputs into training loops." },
      { id: "cv-robustness-eval", name: "Model Robustness Evaluation", brief: "Testing robustness against corruption and noise." }
    ]
  },
  {
    id: "self-supervised-vision",
    name: "Self-Supervised Learning for Vision",
    brief: "Learn visual features without human annotation labels.",
    category: "Deep Learning",
    difficulty: "Hard",
    prerequisites: ["Introduction to CNNs", "Data Augmentation & Training Tricks"],
    subtopics: [
      { id: "cv-ssl-contrastive", name: "Contrastive Learning (SimCLR, MoCo)", brief: "Aligning positive views and pushing negative views." },
      { id: "cv-mae", name: "Masked Autoencoders (MAE)", brief: "Reconstructing hidden patches of images." },
      { id: "cv-dino-ssl", name: "DINO & Self-Distillation", brief: "Training ViT architectures without labels." }
    ]
  },
  {
    id: "explainability-interpretability",
    name: "Explainability & Interpretability",
    brief: "Understand model decisions using attribution maps.",
    category: "Deep Learning",
    difficulty: "Medium-Hard",
    prerequisites: ["Introduction to CNNs"],
    subtopics: [
      { id: "cv-gradcam", name: "Grad-CAM & Saliency Maps", brief: "Using final conv layer gradients to map focus areas." },
      { id: "cv-shap", name: "SHAP for Image Models", brief: "Calculating game-theoretic pixel contributions." },
      { id: "cv-feature-vis", name: "What Does the Network Actually See?", brief: "Synthesizing inputs that maximize activations." }
    ]
  },
  {
    id: "end-to-end-projects",
    name: "End-to-End Projects",
    brief: "Build functional production computer vision projects.",
    category: "Projects",
    difficulty: "Mixed",
    prerequisites: ["Deep Learning & Classical CV basics"],
    subtopics: [
      { id: "cv-proj-alpr", name: "Build a Real-Time License Plate Reader [Medium]", brief: "YOLO detection + OCR recognition pipeline." },
      { id: "cv-proj-search", name: "Build a Visual Search Engine [Hard]", brief: "Feature database retrieval using vector embeddings." },
      { id: "cv-proj-defect", name: "Build a Defect Detection System (Manufacturing) [Hard]", brief: "Anomaly segmentation under strict timing limits." },
      { id: "cv-proj-filter", name: "Build an AR Filter (Face Mesh + Overlay) [Medium]", brief: "MediaPipe keypoint tracking + image mapping." },
      { id: "cv-proj-scanner", name: "Build a Document Scanner App [Easy-Medium]", brief: "Contour perspective transformation + binarization." }
    ]
  }
];

function getContent(sectionId: string, topic: CVTopic): string {
  const name = topic.name;
  const prereqs = topic.prerequisites.join(', ');

  const templates: Record<string, string> = {
    prerequisites: `**Prerequisites for ${name}:**\n\n${topic.prerequisites.map((p, i) => `${i + 1}. **${p}** — Foundational understanding required before exploring this topic.`).join('\n')}\n\n**Why these matter:**\nWithout solid grounding in ${prereqs || 'basic mathematics'}, the mathematical derivations and intuition behind ${name} will be difficult to follow. Ensure you review these foundations before starting.`,

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

const SECTION_DEFS = [
  { id: 'prerequisites', label: 'Prerequisites', icon: 'AcademicCapIcon', subtitle: 'What to know before diving in' },
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

const QUIZ_BANK = [
  { q: 'Why is the HSV color space preferred over RGB for color-based object segmentation?', options: ['It uses fewer channels', 'It separates intensity/value from color/hue information', 'It is computationally faster to read', 'RGB is deprecated'], answer: 1, explanation: 'In HSV, Hue represents pure color. This isolates color values from illumination and shadowing variations (which affect Saturation and Value), making thresholding far more robust.' },
  { q: 'What is the mathematical definition of a Sobel kernel in the X direction?', options: ['A symmetric blur kernel', 'A derivative filter approximating horizontal gradients', 'An identity matrix', 'A high pass sharpening kernel'], answer: 1, explanation: 'The Sobel X operator estimates the horizontal gradient of an image (change in intensity from left to right) using local differentiation.' },
  { q: 'In Canny edge detection, what is the purpose of non-maximum suppression?', options: ['To remove color channels', 'To thin the detected edge boundaries into single-pixel wide lines', 'To increase the thickness of edges', 'To normalise lighting gradients'], answer: 1, explanation: 'Non-maximum suppression suppresses all gradient values that are not local maxima along the gradient direction, keeping only the thin ridge lines.' },
  { q: 'What is the main difference between Erosion and Dilation in mathematical morphology?', options: ['Erosion expands white regions; Dilation shrinks them', 'Erosion shrinks white regions; Dilation expands them', 'Dilation is only for color images', 'Erosion removes high frequencies'], answer: 1, explanation: 'Erosion shrinks foreground objects (binary 1s) by requiring all structural element pixels to fit, while Dilation expands boundaries.' },
];

function cvDiffStyle(d: string): { badge: string; bar: string } {
  switch (d) {
    case 'Easy':        return { badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', bar: 'bg-emerald-500' };
    case 'Easy-Medium': return { badge: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',           bar: 'bg-teal-500'   };
    case 'Medium':      return { badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',       bar: 'bg-amber-500'  };
    case 'Medium-Hard': return { badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',  bar: 'bg-orange-500' };
    case 'Mixed':       return { badge: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',  bar: 'bg-indigo-500' };
    default:            return { badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',           bar: 'bg-rose-500'   };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CV WIKI INDEX
══════════════════════════════════════════════════════════════════════ */
function CVWikiIndex({
  groupedSections, allTopics, onSelectTopic, onSelectSub,
}: {
  groupedSections: { name: string; topics: CVTopic[] }[];
  allTopics: CVTopic[];
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
}) {
  const totalSubs  = allTopics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount  = allTopics.filter(t => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard').length;
  const easyCount  = allTopics.filter(t => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium').length;

  return (
    <div className="lab-container space-y-10">

      {/* ── Hero banner ── */}
      <div className="lab-hero p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(26,157,143,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/25">
              <Icon name="EyeIcon" size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">CV Lab Wiki</h1>
              <p className="text-sm text-muted-foreground">Computer vision interview preparation handbook</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Categories', value: groupedSections.length, color: 'text-teal-600 dark:text-teal-400',    bg: 'bg-teal-500/10'    },
              { label: 'Topics',     value: allTopics.length,        color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-500/10'    },
              { label: 'Subtopics', value: totalSubs,                color: 'text-sky-600 dark:text-sky-400',     bg: 'bg-sky-500/10'     },
              { label: 'Hard',       value: hardCount,               color: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-500/10'    },
              { label: 'Easy',       value: easyCount,               color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
            ].map(stat => (
              <div key={stat.label} className={`${stat.bg} border border-border rounded-xl px-4 py-2.5 backdrop-blur-sm min-w-[64px]`}>
                <div className={`text-2xl font-bold ${stat.color} leading-none`}>{stat.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Clickable Category Index ── */}
      <div className="lab-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <Icon name="ListBulletIcon" size={14} className="text-muted-foreground" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">Category Index</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{groupedSections.length} categories</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-0.5">
            {groupedSections.map((section, i) => (
              <a key={section.name}
                href={`#cv-cat-${section.name.replace(/[\s&/()']/g, '-')}`}
                className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all group">
                <span className="text-[9px] text-muted-foreground/30 w-4 text-right flex-shrink-0">{i + 1}</span>
                <span className="flex-1 truncate group-hover:text-teal-400 transition-colors">{section.name}</span>
                <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{section.topics.length}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Per-category topic cards ── */}
      {groupedSections.map(section => (
        <div key={section.name} id={`cv-cat-${section.name.replace(/[\s&/()']/g, '-')}`} className="space-y-3 scroll-mt-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-foreground whitespace-nowrap">{section.name}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{section.topics.length} topics</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-6">
            {section.topics.map(t => {
              const ds = cvDiffStyle(t.difficulty);
              return (
                <div key={t.id}
                  className="display-card group relative overflow-hidden cursor-pointer h-full"
                  onClick={() => onSelectTopic(t.id)}>
                  {/* Difficulty accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${ds.bar} opacity-40 group-hover:opacity-80 transition-opacity rounded-l-xl`} />
                  <div className="pl-4 pr-4 pt-3.5 pb-3">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-[var(--wiki-cv-hover)] transition-colors leading-snug flex-1 min-w-0">
                        {t.name}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border leading-none">{t.category}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${ds.badge}`}>{t.difficulty}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{t.brief}</p>

                    {t.prerequisites.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        <span className="text-[9px] text-muted-foreground/60 self-center">Prereqs:</span>
                        {t.prerequisites.map(p => (
                          <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/5 text-primary/70 border border-primary/10 leading-none">{p}</span>
                        ))}
                      </div>
                    )}

                    {t.subtopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {t.subtopics.map(s => (
                          <button key={s.id}
                            onClick={e => { e.stopPropagation(); onSelectSub(t.id, s.id); }}
                            title={s.brief}
                            className="text-[9px] px-2 py-1 rounded-md bg-muted/80 text-muted-foreground hover:bg-teal-500/15 hover:text-teal-400 transition-all border border-transparent hover:border-teal-500/20 leading-none">
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function initSections(): Record<string, SectionState> {
  return Object.fromEntries(SECTION_DEFS.map(s => [s.id, { generated: false, generating: false, content: '' }]));
}

export default function CVLabInteractive() {
  const [topics, setTopics] = useState<CVTopic[]>(TOPICS);
  const [selectedTopicId, setSelectedTopicId] = useState('wiki');
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<Record<string, SectionState>>(initSections());
  const [newTopicInput, setNewTopicInput] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);
  const [addingSubtopicTo, setAddingSubtopicTo] = useState<string | null>(null);
  const [newSubtopicInput, setNewSubtopicInput] = useState('');
  const [quizBatch, setQuizBatch] = useState(0);

  const [sectionsData, setSectionsData] = useState<{id: number, labName: string, name: string, isCustom: boolean}[]>([]);
  const [addingSection, setAddingSection] = useState(false);
  const [customSectionInput, setCustomSectionInput] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [addingTopicToSection, setAddingTopicToSection] = useState<string | null>(null);
  const [newTopicInputSection, setNewTopicInputSection] = useState('');
  const [showAddSec, setShowAddSec] = useState(false);
  const [leftOpen,      setLeftOpen]      = useState(true);
  const [rightOpen,     setRightOpen]     = useState(true);
  const [recentTopics,  setRecentTopics]  = useState<{ id: string; name: string; subId?: string; subName?: string }[]>([]);

  useEffect(() => {
    fetch('http://localhost:8082/cv/sections')
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(data => {
        setSectionsData(data);
        setExpandedSections(new Set(data.map((s: any) => s.name)));
      })
      .catch(err => console.error("Error fetching sections:", err));
  }, []);

  // Restore last opened topic from localStorage on mount
  useEffect(() => {
    const savedTopic  = localStorage.getItem('cv-lab-topic');
    const savedSub    = localStorage.getItem('cv-lab-subtopic');
    const savedRecent = localStorage.getItem('cv-lab-recent-topics');
    if (savedTopic) {
      setSelectedTopicId(savedTopic);
      if (savedTopic !== 'wiki') setExpandedTopics(prev => new Set([...prev, savedTopic]));
    }
    if (savedSub) setSelectedSubtopicId(savedSub);
    if (savedRecent) try { setRecentTopics(JSON.parse(savedRecent)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('cv-lab-topic', selectedTopicId);
    if (selectedSubtopicId) localStorage.setItem('cv-lab-subtopic', selectedSubtopicId);
    else localStorage.removeItem('cv-lab-subtopic');
  }, [selectedTopicId, selectedSubtopicId]);

  const handleAddCustomSection = () => {
    if (!customSectionInput.trim()) return;
    setAddingSection(true);
    const newSection = { name: customSectionInput.trim(), isCustom: true };
    fetch('http://localhost:8082/cv/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSection)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setSectionsData(prev => [...prev, { id: Date.now(), labName: 'cv', name: newSection.name, isCustom: true }]);
        setExpandedSections(prev => new Set([...prev, newSection.name]));
        setCustomSectionInput('');
        setAddingSection(false);
      })
      .catch(err => {
        console.error("Error saving custom section:", err);
        setAddingSection(false);
      });
  };

  const handleAddTopicToSection = (sectionName: string) => {
    if (!newTopicInputSection.trim()) return;
    const newTopic = {
      id: `custom-${Date.now()}`,
      name: newTopicInputSection.trim(),
      brief: 'Custom topic.',
      category: sectionName,
      difficulty: 'Medium',
      prerequisites: [],
      subtopics: []
    };

    fetch('http://localhost:8082/cv/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => [...prev, newTopic]);
        setNewTopicInputSection('');
        setAddingTopicToSection(null);
      })
      .catch(err => {
        console.error("Error saving topic to DB:", err);
        setTopics(prev => [...prev, newTopic]);
        setNewTopicInputSection('');
        setAddingTopicToSection(null);
      });
  };


  useEffect(() => {
    fetch('http://localhost:8082/cv/topics')
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then((data: CVTopic[]) => {
        if (data && data.length > 0) {
          setTopics(data);
        } else {
          setTopics(TOPICS);
        }
      })
      .catch(err => {
        console.error("Error fetching CV topics, falling back to static list:", err);
        setTopics(TOPICS);
      });
  }, []);

  const handleAddSubtopic = (topicId: string) => {
    if (!newSubtopicInput.trim()) return;
    const parentTopic = allTopics.find(t => t.id === topicId);
    if (!parentTopic) return;

    const newSubtopic = {
      id: `sub-${Date.now()}`,
      name: newSubtopicInput.trim(),
      brief: 'Custom subtopic.'
    };

    const updatedTopic = {
      ...parentTopic,
      subtopics: [...parentTopic.subtopics, newSubtopic]
    };

    fetch('http://localhost:8082/cv/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => prev.map(t => t.id === topicId ? updatedTopic : t));
        setNewSubtopicInput('');
        setAddingSubtopicTo(null);
        setExpandedTopics(prev => new Set([...prev, topicId]));
      })
      .catch(err => {
        console.error("Error saving subtopic to DB, saving in client state as fallback:", err);
        setTopics(prev => prev.map(t => t.id === topicId ? updatedTopic : t));
        setNewSubtopicInput('');
        setAddingSubtopicTo(null);
        setExpandedTopics(prev => new Set([...prev, topicId]));
      });
  };

  const allTopics = topics.length > 0 ? topics : TOPICS;
  const dynamicSections = sectionsData.map(s => s.name);
  const allSectionNames = Array.from(new Set([...dynamicSections, ...allTopics.map(t => t.category)]));
  const groupedSections = allSectionNames.map(sectionName => ({
    name: sectionName,
    topics: allTopics.filter(t => t.category === sectionName)
  }));
  const currentTopic = allTopics.find(t => t.id === selectedTopicId) ?? null;
  const currentSubtopic = currentTopic?.subtopics.find(s => s.id === selectedSubtopicId) ?? null;
  const contextLabel = selectedTopicId === 'wiki' ? 'Wiki Index' : (currentSubtopic?.name ?? currentTopic?.name ?? 'Computer Vision');

  const flatItems = [
    { id: 'wiki', type: 'topic', topicId: 'wiki', label: 'Wiki Index' },
    ...allTopics.flatMap(t => [
      { id: t.id, type: 'topic', topicId: t.id, label: t.name },
      ...t.subtopics.map(s => ({ id: s.id, type: 'subtopic', topicId: t.id, label: s.name })),
    ])
  ];
  const activeId = selectedSubtopicId ?? selectedTopicId;
  const currentIdx = flatItems.findIndex(x => x.id === activeId);
  const prevItem = currentIdx > 0 ? flatItems[currentIdx - 1] : null;
  const nextItem = currentIdx >= 0 && currentIdx < flatItems.length - 1 ? flatItems[currentIdx + 1] : null;

  const navigateTo = (item: typeof flatItems[0]) => {
    setSelectedTopicId(item.topicId);
    setSelectedSubtopicId(item.type === 'subtopic' ? item.id : null);
    setSections(initSections());
    setQuizBatch(0);
    setExpandedTopics(prev => new Set([...prev, item.topicId]));
  };

  const addToRecent = (topicId: string, topicName: string, subId?: string, subName?: string) => {
    const key = subId ?? topicId;
    setRecentTopics(prev => {
      const filtered = prev.filter(r => (r.subId ?? r.id) !== key);
      const next = [{ id: topicId, name: topicName, subId, subName }, ...filtered].slice(0, 10);
      localStorage.setItem('cv-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const removeRecentTopic = (key: string) => {
    setRecentTopics(prev => {
      const next = prev.filter(r => (r.subId ?? r.id) !== key);
      localStorage.setItem('cv-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const selectTopic = (id: string) => {
    setSelectedTopicId(id);
    setSelectedSubtopicId(null);
    setSections(initSections());
    setQuizBatch(0);
    if (id !== 'wiki') {
      setExpandedTopics(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
      const t = topics.find(tt => tt.id === id);
      if (t) addToRecent(id, t.name);
    }
  };

  const selectSubtopic = (topicId: string, subId: string) => {
    setSelectedTopicId(topicId);
    setSelectedSubtopicId(subId);
    setSections(initSections());
    setQuizBatch(0);
    setExpandedTopics(prev => new Set([...prev, topicId]));
    const t = topics.find(tt => tt.id === topicId);
    const s = t?.subtopics.find(ss => ss.id === subId);
    if (t && s) addToRecent(topicId, t.name, subId, s.name);
  };

  const generateSection = (sectionId: string) => {
    if (!currentTopic) return;
    setSections(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], generating: true } }));
    setTimeout(() => {
      const content = getContent(sectionId, currentTopic);
      setSections(prev => ({ ...prev, [sectionId]: { generated: true, generating: false, content } }));
    }, 1500);
  };

  const handleAddTopic = () => {
    if (!newTopicInput.trim()) return;
    setAddingTopic(true);
    const newTopic: CVTopic = {
      id: `custom-${Date.now()}`,
      name: newTopicInput.trim(),
      brief: 'Custom CV topic.',
      category: 'Custom',
      difficulty: 'Medium',
      prerequisites: ['Computer Vision Basics'],
      subtopics: [{ id: `sub-${Date.now()}`, name: 'Core Concepts', brief: 'Fundamental concepts.' }]
    };

    fetch('http://localhost:8082/cv/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => [...prev, newTopic]);
        setNewTopicInput('');
        setAddingTopic(false);
      })
      .catch(err => {
        console.error("Error saving custom topic to DB, saving in client state as fallback:", err);
        setTopics(prev => [...prev, newTopic]);
        setNewTopicInput('');
        setAddingTopic(false);
      });
  };

  return (
    <div className="lab-shell flex flex-col">
      <div className="lab-workspace flex">

        {/* ── LEFT: Topic Tree ────────────────────────────────────────────── */}
        <aside className="lab-sidebar border-r flex flex-col overflow-hidden" style={{ width: leftOpen ? 264 : 48, minWidth: leftOpen ? 264 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}>

          {/* Header */}
          <div className="flex-shrink-0 border-b border-border">
            <div className="flex items-center gap-2.5 px-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-teal-500/20">
                <Icon name="EyeIcon" size={15} className="text-white" />
              </div>
              {leftOpen && (
                <>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground tracking-tight">Computer Vision</h2>
                    <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{allTopics.length} topics · {groupedSections.length} categories</p>
                  </div>
                  <button onClick={() => setLeftOpen(false)} className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Collapse sidebar">
                    <Icon name="ChevronLeftIcon" size={14} />
                  </button>
                </>
              )}
            </div>
            {leftOpen && (
              <div className="px-3 pb-3">
                {showAddSec ? (
                  <div className="flex gap-1.5">
                    <input autoFocus value={customSectionInput} onChange={e => setCustomSectionInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { handleAddCustomSection(); setShowAddSec(false); } if (e.key === 'Escape') { setShowAddSec(false); setCustomSectionInput(''); } }}
                      placeholder="New category…"
                      className="flex-1 min-w-0 bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--lab-cv)]/50 placeholder:text-muted-foreground/50" />
                    <button onClick={() => { handleAddCustomSection(); setShowAddSec(false); }} disabled={addingSection || !customSectionInput.trim()}
                      className="px-2.5 py-1.5 bg-[var(--lab-cv)] text-white rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50">
                      {addingSection ? '…' : 'Add'}
                    </button>
                    <button onClick={() => { setShowAddSec(false); setCustomSectionInput(''); }}
                      className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-xs rounded-lg hover:bg-muted transition-all">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddSec(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-[var(--lab-cv)] hover:border-[var(--lab-cv)]/40 hover:bg-[var(--lab-cv-soft)] transition-all group">
                    <Icon name="PlusIcon" size={11} className="group-hover:text-[var(--lab-cv)] transition-colors" />
                    Add category / section
                  </button>
                )}
              </div>
            )}
          </div>
          {!leftOpen && (
            <div className="flex justify-center py-1.5">
              <button onClick={() => setLeftOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Expand sidebar">
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          )}

          {leftOpen && (
          <div className="flex-1 overflow-y-auto py-2 scrollbar-clean">

            {/* Wiki Index */}
            <button onClick={() => selectTopic('wiki')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-xl text-xs font-semibold transition-all my-0.5 ${selectedTopicId === 'wiki' ? 'bg-[var(--lab-cv-soft)] text-[var(--lab-cv)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}
              style={{ width: 'calc(100% - 8px)' }}>
              <Icon name="BookOpenIcon" size={13} className={selectedTopicId === 'wiki' ? 'text-[var(--lab-cv)]' : ''} />
              <span className="flex-1 text-left">Wiki Index</span>
              {selectedTopicId === 'wiki' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--lab-cv)] flex-shrink-0" />}
            </button>

            {/* Recently Opened */}
            {recentTopics.length > 0 && (
              <div className="px-2 mt-1 mb-1">
                <div className="flex items-center gap-1 px-1 mb-1.5">
                  <Icon name="ClockIcon" size={10} className="text-muted-foreground/50" />
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Recent</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {recentTopics.map(r => (
                    <div key={r.subId ?? r.id}
                      className="group flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full bg-muted/60 hover:bg-muted transition-all">
                      <button
                        onClick={() => r.subId ? selectSubtopic(r.id, r.subId) : selectTopic(r.id)}
                        className="truncate max-w-[130px] text-[11px] text-muted-foreground hover:text-foreground text-left leading-none py-0.5">
                        {r.subName ?? r.name}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); removeRecentTopic(r.subId ?? r.id); }}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-muted-foreground/20 text-muted-foreground/40 hover:text-foreground transition-all flex-shrink-0">
                        <Icon name="XMarkIcon" size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-3 my-2 h-px bg-border/60" />

            {/* Sections */}
            {groupedSections.map(section => {
              const isExp = expandedSections.has(section.name);
              return (
                <div key={section.name} className="mb-0.5">
                  {/* Section row */}
                  <div className="flex items-center gap-1 px-2 py-1.5 mx-1 cursor-pointer group hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setExpandedSections(prev => { const n = new Set(prev); n.has(section.name) ? n.delete(section.name) : n.add(section.name); return n; })}>
                    <Icon name={isExp ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={10} className="text-muted-foreground/60 flex-shrink-0 transition-transform duration-150" />
                    <span className="flex-1 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate ml-0.5">
                      {section.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {section.topics.length}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setAddingTopicToSection(addingTopicToSection === section.name ? null : section.name); setNewTopicInputSection(''); }}
                      className="p-0.5 rounded-md text-muted-foreground/40 hover:text-[var(--lab-cv)] hover:bg-[var(--lab-cv-soft)] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-0.5"
                      title="Add topic">
                      <Icon name="PlusIcon" size={9} />
                    </button>
                  </div>

                  {/* Add topic inline */}
                  {addingTopicToSection === section.name && (
                    <div className="mx-3 mb-1 flex gap-1">
                      <input autoFocus value={newTopicInputSection} onChange={e => setNewTopicInputSection(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddTopicToSection(section.name); if (e.key === 'Escape') setAddingTopicToSection(null); }}
                        placeholder="Topic name…"
                        className="flex-1 min-w-0 bg-input border border-border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--lab-cv)]/40 placeholder:text-muted-foreground/50" />
                      <button onClick={() => handleAddTopicToSection(section.name)} disabled={!newTopicInputSection.trim()}
                        className="px-1.5 py-1 bg-[var(--lab-cv)]/20 text-[var(--lab-cv)] rounded-md text-[11px] hover:bg-[var(--lab-cv)]/30 disabled:opacity-40 transition-all">✓</button>
                    </div>
                  )}

                  {/* Topics */}
                  {isExp && (
                    <div className="space-y-px pb-1">
                      {section.topics.map((topic, ti) => {
                        const isActive = selectedTopicId === topic.id && !selectedSubtopicId;
                        const isTopExp = expandedTopics.has(topic.id);
                        const ds = cvDiffStyle(topic.difficulty);
                        return (
                          <div key={topic.id}>
                            {/* Topic row */}
                            <div className="flex items-start mx-1">
                              <button onClick={() => selectTopic(topic.id)}
                                className={`flex-1 min-w-0 flex items-start gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${isActive ? 'bg-[var(--lab-cv-soft)] shadow-sm' : 'hover:bg-muted/50'}`}>
                                <span className={`flex-shrink-0 text-[9px] mt-0.5 w-4 text-right leading-none ${isActive ? 'text-[var(--lab-cv)]/80' : 'text-muted-foreground/30'}`}>
                                  {ti + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className={`block text-[12px] font-medium leading-tight truncate ${isActive ? 'text-[var(--lab-cv)]' : 'text-foreground/90'}`}>
                                    {topic.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${ds.badge}`}>{topic.difficulty}</span>
                                    <span className="text-[8px] text-muted-foreground/50 leading-none">{topic.category}</span>
                                  </div>
                                </div>
                              </button>
                              <button
                                onClick={() => setExpandedTopics(prev => { const n = new Set(prev); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; })}
                                className="flex-shrink-0 p-1.5 mt-0.5 rounded-lg text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-all">
                                <Icon name={isTopExp ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={9} />
                              </button>
                            </div>

                            {/* Subtopics */}
                            {isTopExp && (
                              <div className="ml-9 mr-2 space-y-px mb-1">
                                {topic.subtopics.map((sub, idx) => {
                                  const isSubAct = selectedSubtopicId === sub.id;
                                  return (
                                    <button key={sub.id}
                                      onClick={() => selectSubtopic(topic.id, sub.id)}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] leading-tight transition-all ${isSubAct ? 'bg-[var(--lab-cv-soft)] text-[var(--lab-cv)]' : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'}`}>
                                      <span className={`text-[8px] mr-1.5 ${isSubAct ? 'text-[var(--lab-cv)]' : 'text-muted-foreground/30'}`}>
                                        {(idx + 1).toString().padStart(2, '0')}
                                      </span>
                                      <span className="truncate">{sub.name}</span>
                                    </button>
                                  );
                                })}
                                {/* Add subtopic */}
                                {addingSubtopicTo === topic.id ? (
                                  <div className="flex gap-1 mt-1">
                                    <input autoFocus value={newSubtopicInput} onChange={e => setNewSubtopicInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddSubtopic(topic.id); if (e.key === 'Escape') setAddingSubtopicTo(null); }}
                                      placeholder="Subtopic…"
                                      className="flex-1 min-w-0 bg-input border border-border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--lab-cv)]/40 placeholder:text-muted-foreground/50" />
                                    <button onClick={() => handleAddSubtopic(topic.id)}
                                      className="px-1.5 py-1 bg-[var(--lab-cv)]/20 text-[var(--lab-cv)] rounded-md text-[11px] hover:bg-[var(--lab-cv)]/30 transition-all">✓</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setAddingSubtopicTo(topic.id)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 rounded-lg transition-all">
                                    <Icon name="PlusIcon" size={8} />
                                    Add subtopic
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </aside>

        {/* ── CENTER ────────────────────────────────────────────────────────── */}
        <main className="lab-main scrollbar-clean">
          {selectedTopicId !== 'wiki' && (
            <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background/95 backdrop-blur-sm">
              <button onClick={() => selectTopic('wiki')}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-teal-400 transition-colors group">
                <Icon name="ArrowLeftIcon" size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                <span>Wiki Index</span>
              </button>
              {currentTopic && (
                <>
                  <Icon name="ChevronRightIcon" size={10} className="text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate">{currentTopic.name}</span>
                </>
              )}
              {currentSubtopic && (
                <>
                  <Icon name="ChevronRightIcon" size={10} className="text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{currentSubtopic.name}</span>
                </>
              )}
            </div>
          )}
          {selectedTopicId === 'wiki' ? (
            <CVWikiIndex
              groupedSections={groupedSections}
              allTopics={allTopics}
              onSelectTopic={selectTopic}
              onSelectSub={selectSubtopic}
            />
          ) : !currentTopic ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-24">
              <Icon name="EyeIcon" size={48} variant="outline" className="text-muted-foreground/30 mb-18" />
              <h2 className="font-heading text-xl font-semibold text-foreground mb-9">Select a CV Topic</h2>
              <p className="text-sm text-muted-foreground max-w-sm">Choose a topic from the sidebar. Content generates on-demand per section.</p>
            </div>
          ) : (
            <div className="lab-container max-w-card space-y-5">
              {/* ── Hero Topic Header ── */}
              <div className="lab-hero relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(26,157,143,0.12),transparent_60%)] pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="relative">
                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow shadow-teal-500/30 mr-1">
                      <Icon name="EyeIcon" size={15} className="text-white" />
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--lab-cv-soft)] text-[var(--lab-cv)] border border-[var(--lab-cv)]/20 font-medium leading-none">
                      {currentTopic.category}
                    </span>
                    {(() => { const ds = cvDiffStyle(currentTopic.difficulty); return (
                      <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold leading-none ${ds.badge}`}>
                        {currentTopic.difficulty}
                      </span>
                    ); })()}
                    {currentSubtopic && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 leading-none">Subtopic</span>
                    )}
                    {currentTopic.isCustom && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none">Custom</span>
                    )}
                  </div>

                  <h1 className="text-xl font-bold text-foreground mb-2 leading-snug tracking-tight">
                    {currentSubtopic?.name ?? currentTopic.name}
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentSubtopic?.brief ?? currentTopic.brief}
                  </p>

                  {currentTopic.prerequisites.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-muted-foreground font-medium">Prereqs:</span>
                      {currentTopic.prerequisites.map(p => (
                        <span key={p} className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">{p}</span>
                      ))}
                    </div>
                  )}

                  {(() => {
                    const genCount = SECTION_DEFS.filter(d => sections[d.id]?.generated).length;
                    return genCount > 0 ? (
                      <div className="mt-4">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                          <span>Sections generated</span>
                          <span className="font-medium text-foreground/80">{genCount} / {SECTION_DEFS.length}</span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${(genCount / SECTION_DEFS.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* ── Content Outline (quick-jump) ── */}
              <div className="lab-card-muted p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Content Outline</p>
                <div className="grid grid-cols-3 gap-1">
                  {SECTION_DEFS.map(def => {
                    const s = sections[def.id];
                    return (
                      <a key={def.id} href={`#sec-${def.id}`}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-all leading-tight ${s?.generated ? 'text-teal-400 bg-teal-500/10 hover:bg-teal-500/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s?.generated ? 'bg-teal-400' : s?.generating ? 'bg-blue-400 animate-pulse' : 'bg-muted-foreground/20'}`} />
                        <span className="truncate">{def.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* ── Generate Questions ── */}
              <GenerateQuestionsPanel
                topicName={currentTopic.name}
                subtopicName={currentSubtopic?.name}
                labName="cv"
                accentVar="--lab-cv"
              />

              {/* ── On-demand sections ── */}
              <div className="space-y-4">
                {SECTION_DEFS.map((def, idx) => {
                  const s = sections[def.id] ?? { generated: false, generating: false, content: '' };
                  return (
                    <div key={def.id} id={`sec-${def.id}`} className="scroll-mt-4">
                      <OnDemandSection sectionIndex={idx + 1} icon={def.icon} title={def.label} subtitle={def.subtitle}
                        content={s.content} isGenerated={s.generated} isGenerating={s.generating} onGenerate={() => generateSection(def.id)}>
                        {def.id === 'quiz' && s.generated ? (
                          <QuizCarousel questions={QUIZ_BANK.slice(quizBatch * 4, quizBatch * 4 + 4)} hasMore={true}
                            onGenerateMore={() => setQuizBatch(b => b + 1)} />
                        ) : undefined}
                      </OnDemandSection>
                    </div>
                  );
                })}
              </div>

              {/* ── Prev / Next ── */}
              <div className="flex items-center justify-between py-4 border-t border-border mt-2">
                <button disabled={!prevItem} onClick={() => prevItem && navigateTo(prevItem)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30 disabled:pointer-events-none">
                  <Icon name="ArrowLeftIcon" size={14} />{prevItem?.label ?? 'No previous'}
                </button>
                <button disabled={!nextItem} onClick={() => nextItem && navigateTo(nextItem)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30 disabled:pointer-events-none">
                  {nextItem?.label ?? 'No next'}<Icon name="ArrowRightIcon" size={14} />
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ── RIGHT: Copilot ─────────────────────────────────────────────── */}
        <aside className="lab-copilot border-l flex flex-col overflow-hidden" style={{ width: rightOpen ? 300 : 48, minWidth: rightOpen ? 300 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}>
          {rightOpen ? (
            <LabCopilot context={contextLabel} labType="cv" onCollapse={() => setRightOpen(false)} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-3">
              <button onClick={() => setRightOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Show Copilot">
                <Icon name="ChevronLeftIcon" size={14} />
              </button>
              <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center mt-1">
                <Icon name="SparklesIcon" size={12} className="text-secondary" variant="solid" />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
