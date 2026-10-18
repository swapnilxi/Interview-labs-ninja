/**
 * The "Prerequisites" section of a Computer Vision topic: specific skills to have before the topic,
 * grouped as Python & library skills / Math & tensor operations / Core concepts.
 *
 * Each topic gets its own bullets (keyed by topic id, the same ids the backend seeds) followed by the
 * baseline of its category. The topic's own `prerequisites` (names of other topics in this lab) are
 * listed first as "Study these topics first".
 */
import { prereqMarkdown } from '@/modules/common/lab/prereqMarkdown';

interface Skills {
  python?: string[];
  math?: string[];
  concepts?: string[];
}

const BY_CATEGORY: Record<string, Skills> = {
  Fundamentals: {
    python: [
      'NumPy arrays: `shape`, `dtype`, indexing and slicing (`img[y1:y2, x1:x2]`)',
      'Creating arrays: `np.zeros`, `np.ones`, `astype(np.uint8)`',
      '`cv2.imread` returns BGR (or `None` if the path is wrong); `plt.imshow` expects RGB',
    ],
    math: [
      'An image as a matrix: H x W for grayscale, H x W x 3 for colour',
      'Value ranges: `uint8` 0-255 vs `float` 0-1',
    ],
    concepts: ['Pixel, channel, resolution', 'Coordinates: x is the column, y is the row'],
  },
  'Classical CV': {
    python: [
      'NumPy vectorised operations and broadcasting, instead of per-pixel Python loops',
      'OpenCV conventions: BGR channel order, kernel sizes must be odd, 8-bit input for many functions',
      'Converting results between NumPy arrays and Python lists / dicts (`arr.tolist()`, `np.array(list)`)',
      'Storing results in a dict, for example `{"area": a, "bbox": (x, y, w, h)}`',
    ],
    math: [
      'Matrix multiplication',
      '2D convolution as a sliding weighted sum',
      'Derivatives as differences between neighbouring pixels',
    ],
    concepts: ['Grayscale vs BGR vs HSV', 'Image coordinates and ROI cropping'],
  },
  'Geometry & Stereo': {
    python: [
      'NumPy matrix operations: `@`, `np.linalg.inv`, `np.linalg.svd`, `np.linalg.solve`',
      'Building homogeneous coordinates: `np.hstack([pts, np.ones((n, 1))])`',
      'Reshaping point arrays to the shapes OpenCV expects, such as `(N, 1, 2)`',
    ],
    math: [
      'Matrix multiplication and inverses',
      'Homogeneous coordinates',
      'Rotation matrix R and translation vector t',
      'SVD and least squares',
    ],
    concepts: [
      'Pinhole camera model',
      'Intrinsic matrix K (`fx`, `fy`, `cx`, `cy`) and extrinsic matrix `[R | t]`',
    ],
  },
  'Deep Learning': {
    python: [
      'PyTorch tensors: `shape`, `dtype`, `device`, `.to(device)`, `view` / `reshape`, `permute` (HWC to CHW)',
      'Tensor matrix operations: `@` / `torch.matmul`, batched matmul, `sum` / `mean` along a dim, broadcasting',
      'Training loop: `DataLoader`, `loss.backward()`, `optimizer.step()`, `optimizer.zero_grad()`',
      '`nn.Module` with `__init__` and `forward`',
      'NumPy <-> torch: `torch.from_numpy`, `.detach().cpu().numpy()`',
      'Updating a dict: accumulating metrics per epoch, and loading / editing a `state_dict`',
    ],
    math: [
      'Matrix multiplication and shape tracking (`(B, C, H, W)`)',
      'Chain rule and backpropagation',
      'Softmax and cross-entropy',
      'Gradient descent and learning rate',
    ],
    concepts: [
      'Convolution layer: kernel, stride, padding, channels',
      'ReLU, pooling, BatchNorm',
      'Overfitting, and the train / val / test split',
    ],
  },
  'Generative AI': {
    python: [
      'PyTorch tensors, `nn.Module`, and a training loop with `backward()` and `optimizer.step()`',
      'Random sampling: `torch.randn`, `torch.randn_like`',
      'Matrix multiplication of tensors and broadcasting',
    ],
    math: [
      'Probability distributions, especially the Gaussian; sampling',
      'Log-likelihood and KL divergence (intuition)',
      'Chain rule and backpropagation',
    ],
    concepts: ['CNN encoder / decoder blocks', 'Latent vector (a compressed code of an image)'],
  },
  'Transformers & Attention': {
    python: [
      'PyTorch tensors and `nn.Module`',
      'Batched matrix multiplication (`@`) and `transpose` / `permute`',
      '`softmax(dim=-1)` and `nn.LayerNorm`',
    ],
    math: [
      'Dot product as similarity',
      'Softmax',
      'Matrix shapes in attention: `(B, N, d) @ (B, d, N)`',
    ],
    concepts: ['Self-attention: queries, keys, values', 'Embeddings and positional encoding'],
  },
  MLOps: {
    python: [
      'Virtual environments and pinned dependencies',
      'Config as a dict / YAML, and JSON in and out',
      'A small REST service (FastAPI): request body to NumPy array to response dict',
    ],
    math: ['Throughput = batch size / latency', 'Floating point precision: FP32 vs FP16 vs INT8'],
    concepts: ['Inference vs training', 'CPU vs GPU, and what a Docker image is'],
  },
  Projects: {
    python: [
      'Project layout: modules, `argparse`, logging',
      'Config as a dict (YAML to dict), and saving / loading results as JSON',
      'NumPy and PyTorch tensor basics, and a training loop',
    ],
    math: ['Metrics: accuracy, precision, recall, IoU, mAP'],
    concepts: [
      'Framing a problem as classification, detection or segmentation',
      'Train / val / test split',
    ],
  },
};

const BY_TOPIC: Record<string, Skills> = {
  'image-basics': {
    python: [
      '`cv2.cvtColor(img, cv2.COLOR_BGR2RGB)` and why the order matters',
      '`uint8` wrap-around: `np.uint8(250) + 10` is 4, not 260; use `cv2.add` or cast to `int` / `float`',
    ],
    concepts: ['RGB vs HSV vs LAB colour spaces', 'Bit depth (8-bit vs float images)'],
  },
  'filtering-convolution': {
    python: ['`cv2.filter2D`, `cv2.GaussianBlur`, `np.pad` with `mode="reflect"`'],
    math: [
      'The convolution formula, and the difference between convolution and correlation (kernel flip)',
      'Output size with padding and stride: `(W - K + 2P) / S + 1`',
      'The Gaussian function and what sigma controls',
    ],
    concepts: [
      'Low-pass vs high-pass filters',
      'Separable kernels',
      'Border handling (zero, reflect, replicate)',
    ],
  },
  'thresholding-binarization': {
    python: [
      'Boolean masks: `mask = img > t`, `np.where`, `img[mask] = 255`',
      '`cv2.threshold` and `cv2.adaptiveThreshold`, including `THRESH_OTSU`',
    ],
    concepts: [
      'Intensity histogram',
      'Otsu: pick the threshold that minimises within-class variance',
      'Global vs adaptive thresholding',
    ],
  },
  'edge-detection': {
    python: ['`cv2.Sobel`, `cv2.Canny`, `np.hypot` / `cv2.magnitude`'],
    math: [
      'Image gradient `(Gx, Gy)`, magnitude `sqrt(Gx² + Gy²)` and direction `atan2(Gy, Gx)`',
      'Sobel kernels as derivative-plus-smoothing',
    ],
    concepts: [
      'Canny steps: Gaussian blur, gradient, non-maximum suppression, hysteresis thresholds',
      'Why edge detectors are noise sensitive, so blur first',
    ],
  },
  morphological: {
    python: ['`cv2.getStructuringElement`, `cv2.erode`, `cv2.dilate`, `cv2.morphologyEx`'],
    math: ['Erosion and dilation as min / max over a neighbourhood'],
    concepts: [
      'Structuring element (kernel shape and size)',
      'Opening, closing, gradient, top-hat',
      'Binary images, so thresholding comes first',
    ],
  },
  'contour-detection': {
    python: [
      '`cv2.findContours` returns `(contours, hierarchy)`; each contour is an `(N, 1, 2)` array',
      '`cv2.contourArea`, `cv2.arcLength`, `cv2.boundingRect`, `cv2.approxPolyDP`',
      'Collecting per-contour results into a list of dicts',
    ],
    math: ['Area and perimeter of a polygon', 'Image moments and the centroid'],
    concepts: [
      'Binarise first (contours need a clean binary image)',
      'Bounding box, convex hull, contour hierarchy',
    ],
  },
  'feature-detection': {
    python: [
      'Lists of `cv2.KeyPoint` objects and descriptor arrays (`np.float32` / `uint8`)',
      '`cv2.ORB_create`, `cv2.SIFT_create`, `cv2.BFMatcher`, `cv2.drawMatches`',
    ],
    math: [
      'Image gradients',
      'Eigenvalues of the structure tensor (the Harris corner idea)',
      'Distances: Hamming for binary descriptors, L2 for float descriptors',
    ],
    concepts: [
      'Corners, keypoints and descriptors',
      'Lowe ratio test for good matches',
      'RANSAC for rejecting outlier matches',
    ],
  },
  'histogram-analysis': {
    python: ['`np.histogram`, `cv2.calcHist`, `plt.hist`', '`cv2.equalizeHist`, `cv2.createCLAHE`'],
    math: ['Normalising a histogram into a probability distribution', 'Cumulative sum (CDF)'],
    concepts: [
      'Histogram equalisation as a CDF mapping',
      'CLAHE and why global equalisation over-amplifies noise',
    ],
  },
  'geometric-homography': {
    python: [
      '`cv2.getPerspectiveTransform`, `cv2.findHomography`, `cv2.warpPerspective`, `cv2.warpAffine`',
      '`np.hstack` to append a column of ones; reshaping points to `(N, 1, 2)`',
    ],
    math: [
      'Homogeneous coordinates (2D point as `[x, y, 1]`)',
      'The 3x3 homography matrix applied by matrix multiplication, then dividing by the last coordinate',
      'Affine (6 degrees of freedom) vs perspective (8 degrees of freedom)',
      'Solving for H from at least 4 point pairs (least squares / SVD)',
    ],
    concepts: ['RANSAC', 'Interpolation when warping (nearest, bilinear)'],
  },
  'template-matching': {
    python: ['`cv2.matchTemplate`, `cv2.minMaxLoc`, `np.where(res >= thr)` for multiple matches'],
    math: [
      'Sum of squared differences and normalised cross-correlation',
      'Output map size: `(W - w + 1) x (H - h + 1)`',
    ],
    concepts: [
      'Sliding a window over an image',
      'Limits: not scale or rotation invariant',
      'Non-maximum suppression for several matches',
    ],
  },
  'optical-flow': {
    python: [
      'Reading frames: `cv2.VideoCapture`, `cap.read()` in a loop',
      '`cv2.calcOpticalFlowPyrLK` and `cv2.calcOpticalFlowFarneback`; the dense flow array has shape `(H, W, 2)`',
    ],
    math: [
      'Partial derivatives `Ix`, `Iy` (space) and `It` (time)',
      'Solving a small least-squares system `A v = b` for each window',
    ],
    concepts: [
      'Brightness constancy assumption',
      'Aperture problem',
      'Sparse (Lucas-Kanade) vs dense (Farneback) flow',
    ],
  },
  'image-segmentation-classical': {
    python: [
      'Reshaping an image to pixel rows: `img.reshape(-1, 3).astype(np.float32)`',
      '`cv2.kmeans`, `cv2.watershed`, `cv2.grabCut`, `cv2.connectedComponents`',
    ],
    math: ['Euclidean distance between colour vectors', 'Distance transform'],
    concepts: [
      'K-means clustering on pixel colours',
      'Watershed and the role of markers',
      'Connected components after thresholding',
    ],
  },
  'camera-calibration-stereo': {
    python: [
      '`cv2.findChessboardCorners`, `cv2.calibrateCamera` (returns `K`, distortion coefficients, `rvecs`, `tvecs`)',
      '`cv2.undistort`, `cv2.stereoRectify`, `cv2.StereoSGBM_create`',
      'Saving calibration to a dict or `np.savez` and loading it back',
    ],
    math: [
      'Projection `x = K [R | t] X` as matrix multiplication in homogeneous coordinates',
      'Rodrigues rotation vector to rotation matrix',
      'Depth from disparity: `Z = f * B / d`',
    ],
    concepts: [
      'Intrinsic parameters (focal length, principal point, skew) vs extrinsic parameters (rotation and translation, world to camera)',
      'Lens distortion: radial and tangential',
      'Epipolar geometry, the fundamental matrix, rectification',
    ],
  },
  'intro-cnn': {
    python: [
      '`nn.Conv2d`, `nn.MaxPool2d`, `nn.Linear`, `nn.Flatten`, `nn.Sequential`',
      'Inspecting shapes with `print(x.shape)` after each layer',
    ],
    math: [
      'Conv output size `(W - K + 2P) / S + 1` and parameter count `K*K*C_in*C_out + C_out`',
      'Receptive field growth through stacked layers',
    ],
    concepts: ['Why convolution shares weights', 'Feature maps from edges to parts to objects'],
  },
  'transfer-learning': {
    python: [
      '`torchvision.models` with pretrained weights, `ImageFolder`, `DataLoader`',
      'Freezing layers: `for p in model.parameters(): p.requires_grad = False`',
      'Replacing the head: `model.fc = nn.Linear(model.fc.in_features, n_classes)`',
      '`state_dict` is a dict: load, filter keys, update, `load_state_dict(strict=False)`',
    ],
    concepts: [
      'ImageNet mean / std normalisation',
      'Feature extraction vs fine-tuning',
      'A lower learning rate for pretrained layers',
    ],
  },
  'classification-architectures': {
    python: [
      '`nn.Sequential`, `nn.ModuleList`, writing a residual block with `forward(x) = F(x) + x`',
    ],
    math: ['Parameter and FLOP counts of conv layers', 'Why skip connections help gradients flow'],
    concepts: [
      'LeNet, AlexNet, VGG, ResNet, EfficientNet and what each changed',
      '1x1 convolution and global average pooling',
      'Top-1 and top-5 accuracy',
    ],
  },
  'yolo-object-detection': {
    python: [
      'Vectorised IoU with NumPy broadcasting',
      'Detections as a list of dicts such as `{"box": ..., "score": ..., "cls": ...}`: filter by confidence, sort by score',
      '`torchvision.ops.nms`',
    ],
    math: [
      'IoU = intersection area / union area',
      'Precision, recall and the area under the PR curve (mAP)',
    ],
    concepts: [
      'Box formats: xyxy vs xywh vs normalised coordinates',
      'Grid cells, anchors, objectness and class scores',
      'Non-maximum suppression',
    ],
  },
  'two-stage-object-detection': {
    python: ['Boxes as `(N, 4)` tensors; `torchvision.ops.nms` and `torchvision.ops.roi_align`'],
    math: [
      'IoU',
      'Smooth-L1 loss for box regression',
      'Multi-task loss (classification + regression)',
    ],
    concepts: [
      'Region proposal network and anchors',
      'RoI Pooling vs RoI Align',
      'Bounding-box regression',
      'Non-maximum suppression',
    ],
  },
  'semantic-segmentation': {
    python: [
      'Output shape `(N, num_classes, H, W)` and `argmax(dim=1)` to get a class map',
      'One-hot encoding of masks; a mask stores a class id per pixel',
    ],
    math: ['Per-pixel cross-entropy', 'Dice coefficient and mIoU'],
    concepts: [
      'Encoder-decoder (U-Net) and skip connections',
      'Upsampling: transposed convolution and bilinear interpolation',
      'Dilated convolution',
    ],
  },
  'instance-segmentation': {
    python: [
      'torchvision-style targets: a list of dicts with `boxes`, `labels`, `masks`',
      'Boolean mask indexing: `img[mask]`, `masks[i] > 0.5`',
    ],
    math: ['Mask IoU', 'Binary cross-entropy per mask'],
    concepts: [
      'Semantic vs instance segmentation',
      'Mask R-CNN: a mask head added to Faster R-CNN',
      'RoI Align, and one binary mask per instance',
    ],
  },
  gans: {
    python: [
      'Two models and two optimisers; alternating steps with `.detach()` on the generated batch',
      '`nn.ConvTranspose2d`, `torch.randn(batch, z_dim)` for the latent vector',
    ],
    math: ['Binary cross-entropy', 'The minimax objective between generator and discriminator'],
    concepts: ['Generator vs discriminator', 'Mode collapse', 'Why GAN training is unstable'],
  },
  'diffusion-models': {
    python: [
      'Broadcasting schedule values to image shape: `alpha_bar[t].view(-1, 1, 1, 1)`',
      '`torch.randn_like`, indexing a schedule tensor with a batch of timesteps',
    ],
    math: [
      'Forward process: `x_t = sqrt(a_bar_t) * x_0 + sqrt(1 - a_bar_t) * eps`',
      'Gaussian noise and the noise schedule',
      'MSE loss on the predicted noise, ELBO / KL (intuition)',
    ],
    concepts: ['U-Net as the denoiser', 'Timestep embedding', 'The iterative sampling loop'],
  },
  vit: {
    python: [
      'Cutting an image into patches with `reshape` / `unfold` or `einops.rearrange`',
      '`nn.Linear` patch embedding, `nn.MultiheadAttention`, `nn.LayerNorm`',
    ],
    math: [
      'Scaled dot-product attention: `softmax(Q @ K.T / sqrt(d)) @ V`',
      'Tensor shapes through a transformer block: `(B, N, D)`',
    ],
    concepts: [
      'Patch embedding, class token, positional embedding',
      'Multi-head self-attention and the MLP block',
      'Why ViT needs more data than a CNN (no built-in locality)',
    ],
  },
  'clip-multimodal': {
    python: [
      'Batched similarity: `logits = image_emb @ text_emb.T`',
      'Tokenising text, and a dict of `{label: prompt}` for zero-shot classification',
    ],
    math: [
      'Dot product and cosine similarity; L2 normalisation',
      'Softmax with a temperature',
      'Contrastive (InfoNCE) loss',
    ],
    concepts: [
      'Image encoder plus text encoder in one shared embedding space',
      'Zero-shot classification with text prompts',
    ],
  },
  'video-understanding': {
    python: [
      '`cv2.VideoCapture` loop, `cap.get(cv2.CAP_PROP_FPS)`',
      'Stacking frames into a clip with `np.stack`',
    ],
    math: ['Video tensors: `(T, C, H, W)`, or `(B, C, T, H, W)` for 3D convolution'],
    concepts: [
      '3D convolution',
      'Two-stream models (RGB + optical flow)',
      'Frame sampling and stride',
      'Optical flow',
    ],
  },
  'face-detection-recognition': {
    python: [
      '`np.linalg.norm` and a distance matrix with broadcasting',
      'A database as a dict `{name: embedding}`: add / update entries, find the nearest',
    ],
    math: [
      'Cosine and Euclidean distance between embeddings',
      'Triplet loss and ArcFace margin (intuition)',
    ],
    concepts: [
      'Detection (find the face) vs recognition (embed and compare)',
      'Alignment with facial landmarks',
      '1:1 verification vs 1:N identification, and choosing a distance threshold',
    ],
  },
  'ocr-document-analysis': {
    python: [
      '`pytesseract.image_to_data` (a dict of boxes, text, confidences)',
      'String cleanup and `re` regular expressions',
      'Bounding boxes `(x, y, w, h)` for words and lines',
    ],
    math: ['Edit distance behind character / word error rate'],
    concepts: [
      'Text detection vs text recognition',
      'Preprocessing: deskew, binarise, denoise',
      'CRNN with CTC loss',
      'Layout analysis',
    ],
  },
  'pose-estimation': {
    python: [
      'Heatmap to coordinates: `np.unravel_index(hm.argmax(), hm.shape)`',
      'A pose as a dict `{joint: (x, y, conf)}`',
    ],
    math: ['Gaussian heatmaps', 'Euclidean distance between predicted and true keypoints (OKS)'],
    concepts: [
      'Keypoints and the skeleton graph',
      'Heatmap regression vs direct regression',
      'Top-down vs bottom-up pipelines',
    ],
  },
  '3d-vision-depth': {
    python: [
      'Point clouds as `(N, 3)` NumPy arrays',
      'Back-projection with vectorised NumPy: `X = (u - cx) * Z / fx`',
      '`open3d` basics',
    ],
    math: [
      'Matrix multiplication with the intrinsic matrix K',
      'Triangulation with SVD',
      'Rotation matrices and rigid transforms',
    ],
    concepts: [
      'Depth map vs disparity',
      'Intrinsic and extrinsic parameters (see Camera Calibration)',
      'Monocular depth and scale ambiguity',
      'Structure from motion',
    ],
  },
  'model-deployment-vision': {
    python: [
      '`torch.onnx.export`, `onnxruntime.InferenceSession`',
      'Decoding an uploaded image: `np.frombuffer` + `cv2.imdecode`; returning predictions as a JSON dict',
    ],
    math: ['Latency vs throughput', 'Quantisation: FP32 to FP16 to INT8'],
    concepts: [
      'Training / serving parity in preprocessing',
      'Batching and warm-up',
      'TensorRT / ONNX Runtime and Docker at a high level',
    ],
  },
  'data-augmentation-tricks': {
    python: [
      '`albumentations.Compose` and `torchvision.transforms`',
      'Passing a dict `{image, mask, bboxes}` so every target gets the same transform',
      'Fixing random seeds',
    ],
    math: [
      'Mixup / CutMix as convex combinations of two samples and labels',
      'Learning-rate schedules',
    ],
    concepts: [
      'Geometric vs photometric augmentation',
      'Label-preserving transforms',
      'Class imbalance and label smoothing',
    ],
  },
  'adversarial-robustness': {
    python: [
      '`x.requires_grad_(True)`, `loss.backward()`, then `x.grad`',
      '`torch.clamp(x_adv, 0, 1)` to stay a valid image',
    ],
    math: [
      'Gradient of the loss with respect to the input, not the weights',
      'FGSM: `x_adv = x + eps * sign(grad_x L)`',
      'L-infinity and L2 norm balls',
    ],
    concepts: ['White-box vs black-box attacks', 'PGD and adversarial training'],
  },
  'self-supervised-vision': {
    python: [
      'Two augmented views per image from one `Dataset`',
      'A batch similarity matrix `z1 @ z2.T` and cross-entropy over its rows',
    ],
    math: ['Cosine similarity', 'InfoNCE / NT-Xent loss'],
    concepts: [
      'Pretext tasks (rotation, jigsaw)',
      'Contrastive learning: positive vs negative pairs (SimCLR, MoCo)',
      'Masked autoencoders',
      'Linear-probe evaluation',
    ],
  },
  'explainability-interpretability': {
    python: [
      'PyTorch hooks: `register_forward_hook`, `register_full_backward_hook`',
      'Storing activations and gradients in a dict keyed by layer name',
      '`cv2.resize` and `cv2.applyColorMap` to overlay a heatmap',
    ],
    math: [
      'Gradient of the class score with respect to a feature map',
      'Global average pooling of gradients',
    ],
    concepts: [
      'Saliency maps',
      'Grad-CAM: weight the last conv feature maps by pooled gradients',
      'Occlusion sensitivity',
    ],
  },
  'end-to-end-projects': {
    python: [
      'Config as a dict loaded from YAML',
      '`argparse`, logging, saving checkpoints',
      'Experiment tracking (TensorBoard or Weights & Biases)',
    ],
    concepts: [
      'Dataset collection, labelling and a clean train / val / test split',
      'Choosing the metric that matches the task (accuracy, mAP, IoU)',
      'Error analysis',
    ],
  },
};

const FALLBACK = BY_CATEGORY.Fundamentals;

/** Markdown for the Prerequisites section of a CV topic. */
export function buildCvPrerequisitesMarkdown(topic: {
  id: string;
  name: string;
  category: string;
  prerequisites: string[];
}): string {
  const own = BY_TOPIC[topic.id] ?? {};
  const base = BY_CATEGORY[topic.category] ?? FALLBACK;
  const join = (k: keyof Skills) => [...(own[k] ?? []), ...(base[k] ?? [])];
  return prereqMarkdown(`Prerequisites for ${topic.name}`, [
    { title: 'Study these topics first', items: topic.prerequisites },
    { title: 'Python & library skills', items: join('python') },
    { title: 'Math & tensor operations', items: join('math') },
    { title: 'Core concepts', items: join('concepts') },
  ]);
}
