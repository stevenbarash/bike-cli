const pushUnique = (list, item) => {
  if (!list.includes(item)) {
    list.push(item);
  }
};

export const buildBikeTips = (current) => {
  const tips = [
    "Check tire pressure before rolling",
    "Carry a spare tube + mini pump",
    "Front and rear lights if dim out",
    "Quick bolt check on bars and saddle",
  ];

  const precipLikely =
    current.precipProbability >= 40 ||
    current.precipitation >= current.precipitationThreshold;

  if (precipLikely) {
    pushUnique(tips, "Fenders help with wet roads");
    pushUnique(tips, "Lube the chain after wet rides");
  }

  if (current.windSpeed >= 20) {
    pushUnique(tips, "Lower tire pressure slightly for stability");
  }

  if (current.feelsLike <= 40) {
    pushUnique(tips, "Warm up indoors before heading out");
  }

  if (current.feelsLike >= 80) {
    pushUnique(tips, "Carry extra water and electrolytes");
  }

  return tips;
};
