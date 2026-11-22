module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.status(200).json([
    {
      id: 1,
      title: 'Hackaccino',
      type: 'Flagship hackathon',
      date: null,
      location: 'Bennett University',
      description: 'A hackathon community bringing builders, designers and problem-solvers together.',
      link: 'https://www.instagram.com/hackaccino/',
      featured: 1
    },
    {
      id: 2,
      title: 'HYPE 4.0 · Hack Your Profile',
      type: 'Workshop',
      date: '2026-09-28',
      location: 'Bennett University',
      description: 'An introduction to Git and GitHub for aspiring developers.',
      link: 'https://luma.com/k6dsna5h',
      featured: 0
    }
  ]);
};
