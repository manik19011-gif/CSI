module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.status(200).json([
    {
      id: 1,
      title: 'Build the future',
      category: 'Community',
      image_url: '',
      alt_text: 'Abstract community graphic'
    },
    {
      id: 2,
      title: 'Learn together',
      category: 'Workshops',
      image_url: '',
      alt_text: 'Abstract workshop graphic'
    },
    {
      id: 3,
      title: 'Ship something great',
      category: 'Hackathons',
      image_url: '',
      alt_text: 'Abstract hackathon graphic'
    }
  ]);
};
