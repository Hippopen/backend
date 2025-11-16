module.exports = function adminOnly(req,res,next){
  if (req.user?.role !== 'admin') return res.status(403).json({error: 'Admin only'});
  next();
};
