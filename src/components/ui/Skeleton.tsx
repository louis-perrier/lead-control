type SkeletonProps = {
  width?: string;
  height?: string;
  className?: string;
};

const Skeleton = ({ width = "100%", height = "1rem", className = "" }: SkeletonProps) => (
  <div
    className={`animate-pulse rounded-[12px] bg-gradient-to-r from-[#F1F5F9] via-[#E6EBF2] to-[#F1F5F9] ${className}`}
    style={{ width, height }}
  />
);

export default Skeleton;
