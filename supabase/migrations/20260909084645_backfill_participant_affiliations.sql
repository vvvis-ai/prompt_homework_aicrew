with affiliation_roster(challenge_name, participant_name, affiliation) as (
  values
    ('1기', '강보람', '기획감사실'),
    ('1기', '길소선', '수정5동'),
    ('1기', '김수경', '생활보장과'),
    ('1기', '김인혜', '평생교육과'),
    ('1기', '김희성', '문화관광과'),
    ('1기', '문은진', '평생교육과'),
    ('1기', '백영선', '민원여권과'),
    ('1기', '심유나', '평생교육과'),
    ('1기', '안태욱', '평생교육과'),
    ('1기', '오동민', '건축과'),
    ('1기', '윤한내', '민원여권과'),
    ('1기', '이현아', '복지정책과'),
    ('1기', '정유진', '재무과'),
    ('1기', '주영순', '수정5동'),
    ('1기', '황주애', '안전예방과'),
    ('2기', '강세문', '기획감사실'),
    ('2기', '김남희', '건축과'),
    ('2기', '김명훈', '기획감사실'),
    ('2기', '김보영', '수정5동'),
    ('2기', '남수현', '재무과'),
    ('2기', '박윤희', '문화관광과'),
    ('2기', '백근혜', '건축과'),
    ('2기', '서윤정', '환경청소위생과'),
    ('2기', '양소희', '문화관광과'),
    ('2기', '오혜숙', '문화관광과'),
    ('2기', '오희주', '교통행정과'),
    ('2기', '이길례', '생활보장과'),
    ('2기', '이민경', '환경청소위생과'),
    ('2기', '장소향', '선박신고팀'),
    ('2기', '전은정', '일자리경제과'),
    ('2기', '조영임', '교통행정과'),
    ('2기', '최진웅', '총무과'),
    ('2기', '홍민지', '생활보장과')
)
update public.participants as participant
set affiliation = roster.affiliation
from public.challenges as challenge,
     affiliation_roster as roster
where participant.challenge_id = challenge.id
  and challenge.name = roster.challenge_name
  and participant.name = roster.participant_name
  and btrim(participant.affiliation) = '';
