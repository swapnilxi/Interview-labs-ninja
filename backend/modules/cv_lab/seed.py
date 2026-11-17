from __future__ import annotations
import json
import sqlite3


def seed_cv_topics(cursor: sqlite3.Cursor) -> None:
    """Seed the 35 predefined CV topics into the database if empty."""
    cursor.execute("SELECT COUNT(*) FROM cv_topics WHERE is_custom = 0")
    if cursor.fetchone()[0] > 0:
        return

    seed_data = [
        {
            "id": "image-basics",
            "name": "Image Basics & Representation",
            "brief": "Learn pixels, channels, and basic operations with OpenCV.",
            "category": "Fundamentals",
            "difficulty": "Easy",
            "prerequisites": ["Basic Python", "NumPy"],
            "subtopics": [
                {"id": "cv-pixels", "name": "Pixels, Channels, Color Spaces (RGB, HSV, LAB)", "brief": "Understanding how images are represented in memory."},
                {"id": "cv-io", "name": "Image Reading, Writing, Display with OpenCV", "brief": "Loading, displaying, and saving images using cv2."},
                {"id": "cv-transforms", "name": "Image Resizing, Cropping, Rotation", "brief": "Primary geometric manipulation operations."}
            ]
        },
        {
            "id": "filtering-convolution",
            "name": "Image Filtering & Convolution",
            "brief": "Understand spatial filtering and kernel-based image convolution.",
            "category": "Classical CV",
            "difficulty": "Easy",
            "prerequisites": ["Image Basics", "2D Convolution Math"],
            "subtopics": [
                {"id": "cv-kernels", "name": "Kernels & Convolution Operation", "brief": "Mathematical concept of moving a kernel over an image."},
                {"id": "cv-blurs", "name": "Gaussian Blur & Box Blur", "brief": "Image smoothing techniques and low-pass filtering."},
                {"id": "cv-sharpen", "name": "Sharpening Filters", "brief": "Enhancing image high-frequency details."}
            ]
        },
        {
            "id": "thresholding-binarization",
            "name": "Thresholding & Binarization",
            "brief": "Convert grayscale images to binary using global or local thresholding.",
            "category": "Classical CV",
            "difficulty": "Easy",
            "prerequisites": ["Image Basics"],
            "subtopics": [
                {"id": "cv-otsu", "name": "Global Thresholding (Otsu's Method)", "brief": "Automatic thresholding based on bimodal histograms."},
                {"id": "cv-adaptive-thresh", "name": "Adaptive Thresholding", "brief": "Local binarization under uneven lighting conditions."},
                {"id": "cv-color-mask", "name": "Color-based Segmentation (HSV masking)", "brief": "Isolating colored objects in HSV color space."}
            ]
        },
        {
            "id": "edge-detection",
            "name": "Edge Detection",
            "brief": "Detect spatial boundaries and high-contrast lines in images.",
            "category": "Classical CV",
            "difficulty": "Easy-Medium",
            "prerequisites": ["Filtering & Convolution"],
            "subtopics": [
                {"id": "cv-gradients", "name": "Sobel & Laplacian Operators", "brief": "Calculating first and second order spatial derivatives."},
                {"id": "cv-canny", "name": "Canny Edge Detection", "brief": "Multi-stage edge detector with hysteresis thresholding."},
                {"id": "cv-edge-realworld", "name": "Edge Detection for Real-World Images", "brief": "Handling noise and scaling parameter adjustments."}
            ]
        },
        {
            "id": "morphological",
            "name": "Morphological Operations",
            "brief": "Perform mathematical morphology on binary shapes.",
            "category": "Classical CV",
            "difficulty": "Easy",
            "prerequisites": ["Thresholding & Binarization"],
            "subtopics": [
                {"id": "cv-erosion-dilation", "name": "Erosion, Dilation", "brief": "Shrinking or expanding binary shapes."},
                {"id": "cv-open-close", "name": "Opening, Closing", "brief": "Opening and closing operations."},
                {"id": "cv-morph-noise", "name": "Morphological Noise Removal", "brief": "Combining operators to isolate structures."}
            ]
        },
        {
            "id": "contour-detection",
            "name": "Contour Detection & Shape Analysis",
            "brief": "Find, analyze, and classify geometric boundaries in binary images.",
            "category": "Classical CV",
            "difficulty": "Medium",
            "prerequisites": ["Thresholding & Binarization", "Edge Detection"],
            "subtopics": [
                {"id": "cv-find-contours", "name": "Finding & Drawing Contours", "brief": "Extracting curves representing boundaries."},
                {"id": "cv-contour-props", "name": "Contour Properties (area, perimeter, bounding box)", "brief": "Computing geometric indicators of a contour."},
                {"id": "cv-shape-class", "name": "Shape Classification using Contours", "brief": "Sorting contours by circularity or aspect ratio."}
            ]
        },
        {
            "id": "feature-detection",
            "name": "Feature Detection & Matching",
            "brief": "Detect robust keypoints and associate them across multiple viewpoints.",
            "category": "Classical CV",
            "difficulty": "Medium",
            "prerequisites": ["Filtering & Convolution", "Linear Algebra"],
            "subtopics": [
                {"id": "cv-harris", "name": "Harris Corner Detection", "brief": "Detecting corners based on local intensity changes."},
                {"id": "cv-orb", "name": "ORB Feature Detector", "brief": "Fast, scale-invariant binary feature keypoint descriptor."},
                {"id": "cv-matcher", "name": "Feature Matching between Images (BFMatcher)", "brief": "Associating keypoint descriptions using Hamming distance."}
            ]
        },
        {
            "id": "histogram-analysis",
            "name": "Histogram Analysis",
            "brief": "Analyze global color distribution and improve contrast.",
            "category": "Classical CV",
            "difficulty": "Easy-Medium",
            "prerequisites": ["Image Basics"],
            "subtopics": [
                {"id": "cv-hist-compute", "name": "Histogram Computation & Visualization", "brief": "Counting pixel frequency per intensity value."},
                {"id": "cv-clahe", "name": "Histogram Equalization (CLAHE)", "brief": "Contrast adjustment and adaptive equalization."},
                {"id": "cv-backprojection", "name": "Histogram Backprojection", "brief": "Finding regions matching a model color template."}
            ]
        },
        {
            "id": "geometric-homography",
            "name": "Geometric Transformations & Homography",
            "brief": "Project image viewpoints onto planes using linear maps.",
            "category": "Classical CV",
            "difficulty": "Medium",
            "prerequisites": ["Linear Algebra"],
            "subtopics": [
                {"id": "cv-affine", "name": "Affine Transformations", "brief": "Scale, translation, rotation using 2x3 matrices."},
                {"id": "cv-perspective", "name": "Perspective Transform (Bird's Eye View)", "brief": "Warping perspective using 3x3 matrices."},
                {"id": "cv-ransac", "name": "Homography Estimation with RANSAC", "brief": "Calculating projection matrices under outlier noise."}
            ]
        },
        {
            "id": "template-matching",
            "name": "Template Matching & Object Localization",
            "brief": "Search for matches to a smaller reference image within a scene.",
            "category": "Classical CV",
            "difficulty": "Medium",
            "prerequisites": ["Filtering & Convolution"],
            "subtopics": [
                {"id": "cv-tm-methods", "name": "Template Matching Methods", "brief": "Comparing normalized cross-correlation and squared diffs."},
                {"id": "cv-tm-multiscale", "name": "Multi-scale Template Matching", "brief": "Matching template over a range of resolution scales."},
                {"id": "cv-tm-limits", "name": "Limitations & When to Use", "brief": "Sensitivity to scale, rotation, and illumination."}
            ]
        },
        {
            "id": "optical-flow",
            "name": "Optical Flow & Motion Estimation",
            "brief": "Track pixel displacements across video frames.",
            "category": "Classical CV",
            "difficulty": "Medium-Hard",
            "prerequisites": ["Filtering & Convolution", "Calculus"],
            "subtopics": [
                {"id": "cv-lucas-kanade", "name": "Lucas-Kanade Optical Flow", "brief": "Sparse feature tracking over consecutive frames."},
                {"id": "cv-farneback", "name": "Dense Optical Flow (Farneback)", "brief": "Calculating displacement vectors for all pixels."},
                {"id": "cv-motion-tracking", "name": "Motion Detection & Tracking Applications", "brief": "Background subtraction and trajectory tracking."}
            ]
        },
        {
            "id": "image-segmentation-classical",
            "name": "Image Segmentation (Classical)",
            "brief": "Divide an image into semantic regions using classical algorithms.",
            "category": "Classical CV",
            "difficulty": "Medium",
            "prerequisites": ["Contour Detection"],
            "subtopics": [
                {"id": "cv-watershed", "name": "Watershed Algorithm", "brief": "Marker-based image segmentation using topographies."},
                {"id": "cv-grabcut", "name": "GrabCut", "brief": "Interactive foreground extraction using graph cuts."},
                {"id": "cv-meanshift", "name": "Mean Shift Segmentation", "brief": "Clustering pixel colors to partition regions."}
            ]
        },
        {
            "id": "camera-calibration-stereo",
            "name": "Camera Calibration & Stereo Vision",
            "brief": "Extract depth maps and spatial coordinates using multi-camera layouts.",
            "category": "Geometry & Stereo",
            "difficulty": "Hard",
            "prerequisites": ["Linear Algebra", "Geometric Transformations & Homography"],
            "subtopics": [
                {"id": "cv-params", "name": "Intrinsic & Extrinsic Parameters", "brief": "Camera focal length, principal point, pose matrices."},
                {"id": "cv-chessboard", "name": "Chessboard Calibration", "brief": "Estimating distortion coefficients via targets."},
                {"id": "cv-depth-maps", "name": "Stereo Matching & Depth Maps", "brief": "Triangulating disparity values between stereo cameras."}
            ]
        },
        {
            "id": "intro-cnn",
            "name": "Introduction to CNNs",
            "brief": "Understand the layers, math, and operations of convolutional nets.",
            "category": "Deep Learning",
            "difficulty": "Medium",
            "prerequisites": ["Python & PyTorch", "Linear Algebra", "Calculus"],
            "subtopics": [
                {"id": "cv-layers", "name": "Convolution, Pooling, Stride, Padding", "brief": "Core components of convolutional neural layers."},
                {"id": "cv-cnn-scratch", "name": "Building a CNN from Scratch (PyTorch)", "brief": "Assembling layers into a network model in PyTorch."},
                {"id": "cv-cifar", "name": "Training on CIFAR-10", "brief": "Running a complete image classification training cycle."}
            ]
        },
        {
            "id": "transfer-learning",
            "name": "Transfer Learning & Fine-Tuning",
            "brief": "Adapt large pretrained networks to target datasets.",
            "category": "Deep Learning",
            "difficulty": "Medium",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-pretrained", "name": "Using Pretrained Models (ResNet, EfficientNet)", "brief": "Loading model weights pre-trained on ImageNet."},
                {"id": "cv-fe-vs-ft", "name": "Feature Extraction vs Fine-Tuning", "brief": "Freezing backbone weights vs full tuning."},
                {"id": "cv-custom-pipeline", "name": "Custom Dataset Training Pipeline", "brief": "Custom PyTorch Dataset and DataLoader design."}
            ]
        },
        {
            "id": "classification-architectures",
            "name": "Image Classification Architectures",
            "brief": "Trace SOTA backbone structures and design evolutions.",
            "category": "Deep Learning",
            "difficulty": "Medium-Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-archs-evolution", "name": "LeNet -> AlexNet -> VGG (evolution)", "brief": "Timeline of early CNN architectures."},
                {"id": "cv-resnet", "name": "ResNet & Skip Connections", "brief": "Gradient flow optimization via residual blocks."},
                {"id": "cv-efficientnet", "name": "EfficientNet & Compound Scaling", "brief": "Compound scaling of width, depth and resolution."}
            ]
        },
        {
            "id": "yolo-object-detection",
            "name": "Object Detection with YOLO",
            "brief": "Train and deploy single-stage real-time object detectors.",
            "category": "Deep Learning",
            "difficulty": "Medium-Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-yolo-how", "name": "YOLO Architecture & How It Works", "brief": "Grid-based object detection strategy."},
                {"id": "cv-yolo-train", "name": "YOLOv8 Training on Custom Dataset", "brief": "Preparing bounding box labels and running ultralytics."},
                {"id": "cv-yolo-deploy", "name": "Real-Time Detection Deployment", "brief": "Exporting YOLO models to running scripts."}
            ]
        },
        {
            "id": "two-stage-object-detection",
            "name": "Object Detection (Two-Stage)",
            "brief": "Understand region-proposal and anchor-based detector networks.",
            "category": "Deep Learning",
            "difficulty": "Hard",
            "prerequisites": ["Introduction to CNNs", "Object Detection with YOLO"],
            "subtopics": [
                {"id": "cv-rcnn-evolution", "name": "R-CNN -> Fast R-CNN -> Faster R-CNN", "brief": "History of region proposal architectures."},
                {"id": "cv-rpn", "name": "Region Proposal Networks", "brief": "Directing CNN model attention to candidates."},
                {"id": "cv-det-metrics", "name": "Anchor Boxes, IoU, NMS, mAP Metrics", "brief": "Object detection evaluation criteria."}
            ]
        },
        {
            "id": "semantic-segmentation",
            "name": "Semantic Segmentation",
            "brief": "Classify every pixel in an image to a semantic class.",
            "category": "Deep Learning",
            "difficulty": "Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-fcn", "name": "Fully Convolutional Networks (FCN)", "brief": "Replacing linear classifier layers with conv layers."},
                {"id": "cv-unet", "name": "U-Net Architecture & Medical Imaging", "brief": "Symmetrical contracting and expanding paths."},
                {"id": "cv-deeplab", "name": "DeepLabV3+ & Atrous Convolution", "brief": "Capturing context using dilated kernels."}
            ]
        },
        {
            "id": "instance-segmentation",
            "name": "Instance Segmentation",
            "brief": "Identify, segment, and separate individual objects in scenes.",
            "category": "Deep Learning",
            "difficulty": "Hard",
            "prerequisites": ["Object Detection (Two-Stage)", "Semantic Segmentation"],
            "subtopics": [
                {"id": "cv-mask-rcnn", "name": "Mask R-CNN Architecture", "brief": "Adding a mask projection head to Faster R-CNN."},
                {"id": "cv-panoptic", "name": "Panoptic Segmentation", "brief": "Fusing background stuff and foreground things."},
                {"id": "cv-sam", "name": "Segment Anything Model (SAM)", "brief": "Promptable visual foundation segmentation models."}
            ]
        },
        {
            "id": "gans",
            "name": "GANs (Generative Adversarial Networks)",
            "brief": "Train adversarial generator and discriminator models.",
            "category": "Generative AI",
            "difficulty": "Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-gan-loop", "name": "GAN Fundamentals & Training Loop", "brief": "Minimax optimization of generator vs discriminator."},
                {"id": "cv-dcgan", "name": "DCGAN Implementation", "brief": "Using transpose convolutions to synthesize images."},
                {"id": "cv-cyclegan", "name": "CycleGAN (Unpaired Image Translation)", "brief": "Mapping styles across unaligned image sets."}
            ]
        },
        {
            "id": "diffusion-models",
            "name": "Diffusion Models",
            "brief": "Generate high-fidelity images using denoising probability paths.",
            "category": "Generative AI",
            "difficulty": "Hard",
            "prerequisites": ["Semantic Segmentation", "Probability & Calculus"],
            "subtopics": [
                {"id": "cv-ddpm", "name": "DDPM (Denoising Diffusion Probabilistic Models)", "brief": "Forward noise addition and backward denoising loops."},
                {"id": "cv-stable-diff", "name": "Stable Diffusion Architecture", "brief": "Latent diffusion inside encoded vector spaces."},
                {"id": "cv-controlnet", "name": "Controlnet & Guided Generation", "brief": "Injecting spatial conditions into U-Net paths."}
            ]
        },
        {
            "id": "vit",
            "name": "Vision Transformers (ViT)",
            "brief": "Apply self-attention mechanisms directly to image patch sequences.",
            "category": "Transformers & Attention",
            "difficulty": "Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-vit-attn", "name": "Self-Attention for Images", "brief": "Computing query-key similarity matrices over patches."},
                {"id": "cv-vit-patches", "name": "ViT Architecture & Patch Embeddings", "brief": "Flattening 16x16 pixels into token vectors."},
                {"id": "cv-swin", "name": "Swin Transformer & Hierarchical Features", "brief": "Shifted window attention to reduce complexity."}
            ]
        },
        {
            "id": "clip-multimodal",
            "name": "CLIP & Multimodal Vision",
            "brief": "Align text and image embeddings in shared contrastive spaces.",
            "category": "Transformers & Attention",
            "difficulty": "Hard",
            "prerequisites": ["Vision Transformers (ViT)"],
            "subtopics": [
                {"id": "cv-clip-contrastive", "name": "Contrastive Learning for Vision-Language", "brief": "Aligning matched image-text pairs in a batch."},
                {"id": "cv-clip-zeroshot", "name": "Zero-Shot Classification with CLIP", "brief": "Predicting image labels via dynamic text prompts."},
                {"id": "cv-clip-search", "name": "Building a CLIP-based Image Search", "brief": "Searching visual databases using natural language."}
            ]
        },
        {
            "id": "video-understanding",
            "name": "Video Understanding",
            "brief": "Analyze temporal transitions and track objects across frames.",
            "category": "Deep Learning",
            "difficulty": "Medium-Hard",
            "prerequisites": ["Introduction to CNNs", "Optical Flow & Motion Estimation"],
            "subtopics": [
                {"id": "cv-video-io", "name": "Frame Extraction & Video Processing", "brief": "Handling video stream ingestion and encoding."},
                {"id": "cv-tracking", "name": "Object Tracking (DeepSORT, ByteTrack)", "brief": "Kalman filters and embedding associations."},
                {"id": "cv-action-rec", "name": "Action Recognition (SlowFast, I3D)", "brief": "Extracting features across spatial and temporal dimensions."}
            ]
        },
        {
            "id": "face-detection-recognition",
            "name": "Face Detection & Recognition",
            "brief": "Detect human faces and associate them with identities.",
            "category": "Deep Learning",
            "difficulty": "Medium",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-classical-face", "name": "Haar Cascades & HOG Detectors", "brief": "Early face boundary detection heuristics."},
                {"id": "cv-mtcnn", "name": "MTCNN & RetinaFace", "brief": "Cascade deep networks for boundary localization."},
                {"id": "cv-facenet", "name": "FaceNet Embeddings & Face Matching", "brief": "Learning facial feature vectors using triplet loss."}
            ]
        },
        {
            "id": "ocr-document-analysis",
            "name": "OCR & Document Analysis",
            "brief": "Segment layout boundaries and read character symbols in documents.",
            "category": "Deep Learning",
            "difficulty": "Medium",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-tesseract", "name": "Tesseract OCR Pipeline", "brief": "Text detection and character recognition pipeline."},
                {"id": "cv-scene-text", "name": "Scene Text Detection (EAST, CRAFT)", "brief": "Finding dynamic text rotated in natural scenes."},
                {"id": "cv-layout-analysis", "name": "Document Layout Analysis", "brief": "Parsing sections, tables, and paragraphs."}
            ]
        },
        {
            "id": "pose-estimation",
            "name": "Pose Estimation",
            "brief": "Track human joint coordinates and body postures.",
            "category": "Deep Learning",
            "difficulty": "Medium-Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-mediapipe", "name": "OpenPose & MediaPipe", "brief": "Real-time keypoint extraction pipelines."},
                {"id": "cv-hrnet", "name": "HRNet Architecture", "brief": "Preserving high-resolution features across network pipelines."},
                {"id": "cv-pose-apps", "name": "Applications: Fitness, AR, Sign Language", "brief": "Interpreting joint coordinates for motion logic."}
            ]
        },
        {
            "id": "3d-vision-depth",
            "name": "3D Vision & Depth Estimation",
            "brief": "Generate point clouds and estimate scene depth from 2D views.",
            "category": "Geometry & Stereo",
            "difficulty": "Hard",
            "prerequisites": ["Camera Calibration & Stereo Vision"],
            "subtopics": [
                {"id": "cv-mono-depth", "name": "Monocular Depth Estimation (MiDaS)", "brief": "Predicting relative depth from a single camera frame."},
                {"id": "cv-point-clouds", "name": "Point Clouds & PointNet", "brief": "Processing unordered collections of 3D spatial points."},
                {"id": "cv-nerf", "name": "NeRF (Neural Radiance Fields)", "brief": "Synthesizing views using neural implicit representations."}
            ]
        },
        {
            "id": "model-deployment-vision",
            "name": "Model Deployment for Vision",
            "brief": "Optimize and compile neural backbones for target runtimes.",
            "category": "MLOps",
            "difficulty": "Medium",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-onnx", "name": "ONNX Export & Optimization", "brief": "Translating PyTorch models to dynamic computation graphs."},
                {"id": "cv-tensorrt", "name": "TensorRT & OpenVINO", "brief": "Compiling models for Nvidia or Intel silicon layers."},
                {"id": "cv-edge-deploy", "name": "Edge Deployment (Jetson Nano, Mobile)", "brief": "Deploying models inside resource-constrained environments."}
            ]
        },
        {
            "id": "data-augmentation-tricks",
            "name": "Data Augmentation & Training Tricks",
            "brief": "Increase dataset variety and optimize model robustness.",
            "category": "Deep Learning",
            "difficulty": "Easy-Medium",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-albumentations", "name": "Albumentations Library", "brief": "Creating fast, pixel-level bounding box augmentations."},
                {"id": "cv-aug-mix", "name": "Mixup, Cutout, CutMix", "brief": "Creating synthetic linear combination images."},
                {"id": "cv-class-imbalance", "name": "Handling Class Imbalance", "brief": "Focal Loss and weighted sample strategies."}
            ]
        },
        {
            "id": "adversarial-robustness",
            "name": "Adversarial Attacks & Robustness",
            "brief": "Deconstruct models using adversarial perturbations and defend them.",
            "category": "Deep Learning",
            "difficulty": "Hard",
            "prerequisites": ["Introduction to CNNs", "Calculus (gradients)"],
            "subtopics": [
                {"id": "cv-attacks", "name": "FGSM & PGD Attacks", "brief": "Synthesizing input perturbations along loss gradients."},
                {"id": "cv-adv-training", "name": "Adversarial Training", "brief": "Injecting perturbed inputs into training loops."},
                {"id": "cv-robustness-eval", "name": "Model Robustness Evaluation", "brief": "Testing robustness against corruption and noise."}
            ]
        },
        {
            "id": "self-supervised-vision",
            "name": "Self-Supervised Learning for Vision",
            "brief": "Learn visual features without human annotation labels.",
            "category": "Deep Learning",
            "difficulty": "Hard",
            "prerequisites": ["Introduction to CNNs", "Data Augmentation & Training Tricks"],
            "subtopics": [
                {"id": "cv-ssl-contrastive", "name": "Contrastive Learning (SimCLR, MoCo)", "brief": "Aligning positive views and pushing negative views."},
                {"id": "cv-mae", "name": "Masked Autoencoders (MAE)", "brief": "Reconstructing hidden patches of images."},
                {"id": "cv-dino-ssl", "name": "DINO & Self-Distillation", "brief": "Training ViT architectures without labels."}
            ]
        },
        {
            "id": "explainability-interpretability",
            "name": "Explainability & Interpretability",
            "brief": "Understand model decisions using attribution maps.",
            "category": "Deep Learning",
            "difficulty": "Medium-Hard",
            "prerequisites": ["Introduction to CNNs"],
            "subtopics": [
                {"id": "cv-gradcam", "name": "Grad-CAM & Saliency Maps", "brief": "Using final conv layer gradients to map focus areas."},
                {"id": "cv-shap", "name": "SHAP for Image Models", "brief": "Calculating game-theoretic pixel contributions."},
                {"id": "cv-feature-vis", "name": "What Does the Network Actually See?", "brief": "Synthesizing inputs that maximize activations."}
            ]
        },
        {
            "id": "end-to-end-projects",
            "name": "End-to-End Projects",
            "brief": "Build functional production computer vision projects.",
            "category": "Projects",
            "difficulty": "Mixed",
            "prerequisites": ["Deep Learning & Classical CV basics"],
            "subtopics": [
                {"id": "cv-proj-alpr", "name": "Build a Real-Time License Plate Reader [Medium]", "brief": "YOLO detection + OCR recognition pipeline."},
                {"id": "cv-proj-search", "name": "Build a Visual Search Engine [Hard]", "brief": "Feature database retrieval using vector embeddings."},
                {"id": "cv-proj-defect", "name": "Build a Defect Detection System (Manufacturing) [Hard]", "brief": "Anomaly segmentation under strict timing limits."},
                {"id": "cv-proj-filter", "name": "Build an AR Filter (Face Mesh + Overlay) [Medium]", "brief": "MediaPipe keypoint tracking + image mapping."},
                {"id": "cv-proj-scanner", "name": "Build a Document Scanner App [Easy-Medium]", "brief": "Contour perspective transformation + binarization."}
            ]
        }
    ]

    for topic in seed_data:
        cursor.execute(
            """
            INSERT OR IGNORE INTO cv_topics (
                id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                topic["id"],
                topic["name"],
                topic["brief"],
                topic["category"],
                topic["difficulty"],
                json.dumps(topic.get("prerequisites", [])),
                json.dumps(topic.get("subtopics", [])),
            )
        )
